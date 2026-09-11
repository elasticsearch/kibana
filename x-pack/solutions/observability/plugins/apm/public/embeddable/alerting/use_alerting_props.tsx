/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useState, useEffect } from 'react';
import type { Rule } from '@kbn/alerting-plugin/common';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { ApmDocumentType } from '@kbn/apm-types';
import { getTransactionType } from '../../context/apm_service/apm_service_context';
import { useServiceTransactionTypesFetcher } from '../../context/apm_service/use_service_transaction_types_fetcher';
import { useServiceAgentFetcher } from '../../context/apm_service/use_service_agent_fetcher';
import { usePreferredDataSourceAndBucketSize } from '../../hooks/use_preferred_data_source_and_bucket_size';
import { useTimeRange } from '../../hooks/use_time_range';
import { getComparisonChartTheme } from '../../components/shared/time_comparison/get_comparison_chart_theme';
import { getAggsTypeFromRule } from '../../components/alerting/ui_components/alert_details_app_section/helpers';
import { getTimeZone } from '../../components/shared/charts/helper/timezone';
import type { LatencyAggregationType } from '../../../common/latency_aggregation_types';
import { ENVIRONMENT_ALL } from '../../../common/environment_filter_values';

export function useAlertingProps({
  rule,
  serviceName,
  kuery = '',
  rangeFrom,
  rangeTo,
  defaultTransactionType,
}: {
  rule: Rule<{ aggregationType: LatencyAggregationType }>;
  serviceName: string;
  kuery?: string;
  rangeFrom: string;
  rangeTo: string;
  defaultTransactionType?: string;
}) {
  const {
    services: { uiSettings },
  } = useKibana();

  const timeZone = getTimeZone(uiSettings);
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });
  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    type: ApmDocumentType.TransactionMetric,
    numBuckets: 100,
  });
  const { transactionTypes } = useServiceTransactionTypesFetcher({
    serviceName,
    start,
    end,
    documentType: preferred?.source.documentType,
    rollupInterval: preferred?.source.rollupInterval,
  });
  const { agentName } = useServiceAgentFetcher({
    serviceName,
    environment: ENVIRONMENT_ALL.value,
    start,
    end,
  });
  const currentTransactionType = getTransactionType({
    transactionTypes,
    transactionType: defaultTransactionType,
    agentName,
  });

  const params = rule.params;
  const comparisonChartTheme = getComparisonChartTheme();

  const [latencyAggregationType, setLatencyAggregationType] = useState(
    getAggsTypeFromRule(params.aggregationType)
  );
  const [transactionType, setTransactionType] = useState(currentTransactionType);

  useEffect(() => {
    setTransactionType(currentTransactionType);
  }, [currentTransactionType]);

  useEffect(() => {
    if (defaultTransactionType) {
      setTransactionType(defaultTransactionType);
    }
  }, [defaultTransactionType]);

  return {
    transactionType,
    transactionTypes,
    setTransactionType,
    latencyAggregationType,
    setLatencyAggregationType,
    comparisonChartTheme,
    timeZone,
  };
}
