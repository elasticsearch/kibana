/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { OBSERVABILITY_TRANSACTION_ATTACHMENT_TYPE_ID } from '@kbn/observability-agent-builder-plugin/public';
import React, { useEffect } from 'react';
import { Redirect, useHistory } from 'react-router-dom';
import { useApmServiceContext } from '../../../context/apm_service/use_apm_service_context';
import { useBreadcrumb } from '../../../context/breadcrumbs/use_breadcrumb';
import { ChartPointerEventContextProvider } from '../../../context/chart_pointer_event/chart_pointer_event_context';
import { useApmPluginContext } from '../../../context/apm_plugin/use_apm_plugin_context';
import { useAnyOfApmParams } from '../../../hooks/use_apm_params';
import { useApmRoutePath } from '../../../hooks/use_apm_route_path';
import { useApmRouter } from '../../../hooks/use_apm_router';
import { useTimeRange } from '../../../hooks/use_time_range';
import { AggregatedTransactionsBadge } from '../../shared/aggregated_transactions_badge';
import { TransactionCharts } from '../../shared/charts/transaction_charts';
import { replace } from '../../shared/links/url_helpers';
import { TransactionDetailsTabs } from './transaction_details_tabs';
import { isServerlessAgentName } from '../../../../common/agent_name';

export function TransactionDetails() {
  const { path, query } = useAnyOfApmParams(
    '/services/{serviceName}/transactions/view',
    '/mobile-services/{serviceName}/transactions/view'
  );
  const {
    transactionName,
    rangeFrom,
    rangeTo,
    transactionType: transactionTypeFromUrl,
    comparisonEnabled,
    offset,
    environment,
    kuery,
    traceId,
    transactionId,
    latencyAggregationType,
  } = query;
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });
  const apmRouter = useApmRouter();
  const apmRouterNoBasePath = useApmRouter({ prependBasePath: false });
  const routePath = useApmRoutePath();
  const { transactionType, fallbackToTransactions, serverlessType, serviceName } =
    useApmServiceContext();
  const { agentBuilder } = useApmPluginContext();

  const history = useHistory();

  useBreadcrumb(
    () => ({
      title: transactionName?.trim() || path.serviceName,
      href: apmRouter.link('/services/{serviceName}/transactions/view', {
        path,
        query,
      }),
    }),
    [apmRouter, path, query, transactionName]
  );

  useEffect(() => {
    if (
      !agentBuilder ||
      !serviceName ||
      !transactionName ||
      !transactionTypeFromUrl ||
      !start ||
      !end
    ) {
      return;
    }

    agentBuilder.setChatConfig({
      attachments: [
        {
          type: OBSERVABILITY_TRANSACTION_ATTACHMENT_TYPE_ID,
          data: {
            serviceName,
            transactionName,
            transactionType: transactionTypeFromUrl,
            traceId,
            transactionId,
            start,
            end,
            attachmentLabel: i18n.translate(
              'xpack.apm.transactionDetails.transactionAttachmentLabel',
              {
                defaultMessage: '{transactionName} transaction',
                values: { transactionName },
              }
            ),
          },
        },
      ],
    });

    return () => {
      agentBuilder.clearChatConfig();
    };
  }, [
    agentBuilder,
    serviceName,
    transactionName,
    transactionTypeFromUrl,
    traceId,
    transactionId,
    start,
    end,
  ]);

  // redirect to transaction list when transactionName is missing (e.g. bad URL, encoding issue)
  if (!transactionName || transactionName.trim() === '') {
    const transactionsListPath = routePath?.includes('mobile-services')
      ? '/mobile-services/{serviceName}/transactions'
      : '/services/{serviceName}/transactions';

    // Preserve only safe query params for the transaction list (time range and filters)
    const safeQuery = {
      comparisonEnabled: query.comparisonEnabled,
      environment: query.environment,
      kuery: query.kuery,
      latencyAggregationType: query.latencyAggregationType,
      offset: query.offset,
      rangeFrom: query.rangeFrom,
      rangeTo: query.rangeTo,
      serviceGroup: query.serviceGroup,
      transactionType: query.transactionType,
    };

    const redirectPath = apmRouterNoBasePath.link(transactionsListPath, {
      path: { serviceName: path.serviceName },
      query: safeQuery,
    });
    return <Redirect to={redirectPath} />;
  }

  if (!transactionTypeFromUrl && transactionType) {
    replace(history, { query: { transactionType } });
  }

  const isServerless = isServerlessAgentName(serverlessType);

  return (
    <>
      {fallbackToTransactions && <AggregatedTransactionsBadge />}
      <EuiSpacer size="s" />

      <EuiTitle>
        <h2>{transactionName}</h2>
      </EuiTitle>

      <EuiSpacer size="m" />

      <ChartPointerEventContextProvider>
        <TransactionCharts
          serviceName={serviceName}
          kuery={kuery}
          environment={environment}
          start={start}
          end={end}
          transactionName={transactionName}
          isServerlessContext={isServerless}
          comparisonEnabled={comparisonEnabled}
          offset={offset}
          latencyAggregationType={latencyAggregationType}
        />
      </ChartPointerEventContextProvider>

      <EuiSpacer size="m" />

      <TransactionDetailsTabs />
    </>
  );
}
