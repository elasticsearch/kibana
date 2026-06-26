/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPagination,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import styled from '@emotion/styled';
import { getContextMenuItemsFromActions } from '@kbn/observability-shared-plugin/public';
import { first } from 'lodash';
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import useAsync from 'react-use/lib/useAsync';
import { ExceptionStacktrace, PlaintextStacktrace, Stacktrace } from '@kbn/event-stacktrace';
import { Timestamp } from '@kbn/apm-ui-shared';
import { O11Y_APM_ERROR_CONTEXT_MENU_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { getTimestampUs } from '../../../../../common/utils/get_timestamp_us';
import type { AT_TIMESTAMP } from '../../../../../common/es_fields/apm';
import type { APMError } from '../../../../../typings/es_schemas/ui/apm_error';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useLegacyUrlParams } from '../../../../context/url_params_context/use_url_params';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useApmRouter } from '../../../../hooks/use_apm_router';
import type { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { isPending, isSuccess } from '../../../../hooks/use_fetcher';
import type { APIReturnType } from '../../../../services/rest/create_call_apm_api';
import { NOT_AVAILABLE_LABEL } from '../../../../../common/i18n';
import { TransactionDetailLink } from '../../../shared/links/apm/transaction_detail_link';
import { fromQuery, toQuery } from '../../../shared/links/url_helpers';
import { ErrorMetadata } from '../../../shared/metadata_table/error_metadata';
import { Summary } from '../../../shared/summary';
import { HttpInfoSummaryItem } from '../../../shared/summary/http_info_summary_item';
import { UserAgentSummaryItem } from '../../../shared/summary/user_agent_summary_item';
import type { ErrorTab } from './error_tabs';
import { ErrorTabKey, getTabs } from './error_tabs';
import { ErrorUiActionsContextMenu } from './error_ui_actions_context_menu';
import { SampleSummary } from './sample_summary';
import { ErrorSampleContextualInsight } from './error_sample_contextual_insight';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { getComparisonEnabled } from '../../../shared/time_comparison/get_comparison_enabled';
import { buildUrl } from '../../../../utils/build_url';
import { OpenInDiscover } from '../../../shared/links/discover_links/open_in_discover';
import { ERROR_GROUP_DETAILS_EBT_ELEMENTS } from '../ebt_constants';
import {
  ENVIRONMENT_NOT_DEFINED,
  getEnvironmentLabel,
} from '../../../../../common/environment_filter_values';

const TransactionLinkName = styled.div`
  margin-left: ${({ theme }) => theme.euiTheme.size.s};
  display: inline-block;
  vertical-align: middle;
`;

interface Props {
  onSampleClick: (sample: string) => void;
  errorSampleIds: string[];
  errorSamplesFetchStatus: FETCH_STATUS;
  errorData: APIReturnType<'GET /internal/apm/services/{serviceName}/errors/{groupId}/error/{errorId}'>;
  errorFetchStatus: FETCH_STATUS;
  occurrencesCount: number;
}

function getCurrentTab(tabs: ErrorTab[] = [], currentTabKey: string | undefined): ErrorTab | {} {
  const selectedTab = tabs.find(({ key }) => key === currentTabKey);
  return selectedTab ?? (first(tabs) || {});
}

export function ErrorSampleDetails({
  onSampleClick,
  errorSampleIds,
  errorSamplesFetchStatus,
  errorData,
  errorFetchStatus,
  occurrencesCount,
}: Props) {
  const [sampleActivePage, setSampleActivePage] = useState(0);
  const history = useHistory();
  const {
    urlParams: { detailTab, offset, comparisonEnabled },
  } = useLegacyUrlParams();

  const { uiActions, core, observabilityAgentBuilder } = useApmPluginContext();

  const ErrorSampleAiInsight = observabilityAgentBuilder?.getErrorSampleAIInsight();

  const router = useApmRouter();

  const {
    query,
    path: { groupId },
  } = useAnyOfApmParams(
    '/services/{serviceName}/errors/{groupId}',
    '/mobile-services/{serviceName}/errors-and-crashes/errors/{groupId}',
    '/mobile-services/{serviceName}/errors-and-crashes/crashes/{groupId}'
  );

  const { kuery, rangeFrom, rangeTo, environment } = query;
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const loadingErrorSamplesData = isPending(errorSamplesFetchStatus);
  const loadingErrorData = isPending(errorFetchStatus);
  const isLoading = loadingErrorSamplesData || loadingErrorData;

  const isSucceeded = isSuccess(errorSamplesFetchStatus) && isSuccess(errorFetchStatus);

  const defaultComparisonEnabled = getComparisonEnabled({
    core,
    urlComparisonEnabled: comparisonEnabled,
  });

  useEffect(() => {
    setSampleActivePage(0);
  }, [errorSampleIds]);

  const goToSample = (index: number) => {
    const sample = errorSampleIds[index];
    setSampleActivePage(index);
    onSampleClick(sample);
  };

  const { error, transaction } = errorData;

  const externalContextMenuItems = useAsync(() => {
    return getContextMenuItemsFromActions({
      uiActions,
      triggerId: O11Y_APM_ERROR_CONTEXT_MENU_TRIGGER,
      context: {
        error,
        transaction,
      },
    });
  }, [error, transaction, uiActions]);

  if (!error && errorSampleIds?.length === 0 && isSucceeded) {
    return (
      <EuiEmptyPrompt
        title={
          <div>
            {i18n.translate('xpack.apm.errorSampleDetails.sampleNotFound', {
              defaultMessage: 'The selected error cannot be found',
            })}
          </div>
        }
        titleSize="s"
      />
    );
  }

  const tabs = getTabs(error);
  const currentTab = getCurrentTab(tabs, detailTab) as ErrorTab;
  const urlFromError = error?.error?.page?.url || error?.url?.full;
  const urlFromTransaction = transaction?.transaction?.page?.url || transaction?.url?.full;
  const errorOrTransactionUrl = error?.url ? error : transaction;
  const errorOrTransactionHttp = error?.http ? error : transaction;
  const errorOrTransactionUserAgent = error?.user_agent
    ? error.user_agent
    : transaction?.user_agent;

  // To get the error data needed for the summary we use the transaction fallback in case
  // the error data is not available.
  // In case of OTel the error data is not available in the error response and we need to use
  // the associated root span data (which is called "transaction" here because of the APM data model).
  const errorUrl = urlFromError || urlFromTransaction || buildUrl(errorOrTransactionUrl);
  const method = errorOrTransactionHttp?.http?.request?.method;
  const status = errorOrTransactionHttp?.http?.response?.status_code;
  const userAgent = errorOrTransactionUserAgent;
  const errorEnvironment =
    error?.service?.environment ??
    transaction?.service?.environment ??
    ENVIRONMENT_NOT_DEFINED.value;
  const serviceVersion = error?.service?.version ?? transaction?.service?.version ?? undefined;
  const isUnhandled = error?.error?.exception?.[0]?.handled === false;
  const errorType = error?.error?.exception?.[0]?.type ?? error?.error?.type;
  const sdkName = error?.agent?.name;
  const sdkVersion = error?.agent?.version;
  const sdkLabel = [sdkName, sdkVersion].filter(Boolean).join(' ');
  const issueContextItems = [
    {
      title: i18n.translate('xpack.apm.errorSampleDetails.issueContext.groupIdLabel', {
        defaultMessage: 'Group ID',
      }),
      description: groupId || NOT_AVAILABLE_LABEL,
    },
    {
      title: i18n.translate('xpack.apm.errorSampleDetails.issueContext.occurrencesLabel', {
        defaultMessage: 'Occurrences',
      }),
      description: String(occurrencesCount),
    },
    {
      title: i18n.translate('xpack.apm.errorSampleDetails.issueContext.typeLabel', {
        defaultMessage: 'Type',
      }),
      description: errorType || NOT_AVAILABLE_LABEL,
    },
    {
      title: i18n.translate('xpack.apm.errorSampleDetails.issueContext.sdkLabel', {
        defaultMessage: 'SDK',
      }),
      description: sdkLabel || NOT_AVAILABLE_LABEL,
    },
  ];

  return (
    <EuiPanel hasBorder={true}>
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>
              {i18n.translate('xpack.apm.errorSampleDetails.errorOccurrenceTitle', {
                defaultMessage: 'Error sample',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow>
          {!!errorSampleIds?.length && (
            <EuiPagination
              pageCount={errorSampleIds.length}
              activePage={sampleActivePage}
              onPageClick={goToSample}
              aria-label={i18n.translate('xpack.apm.errorSampleDetails.paginationAriaLabel', {
                defaultMessage: 'Error sample pages',
              })}
              compressed
            />
          )}
        </EuiFlexItem>
        {externalContextMenuItems.value?.length ? (
          <ErrorUiActionsContextMenu items={externalContextMenuItems.value} />
        ) : undefined}
        <EuiFlexItem grow={false}>
          <OpenInDiscover
            dataTestSubj="errorSampleOpenInDiscoverButton"
            variant="iconButton"
            label={i18n.translate('xpack.apm.errorSampleDetails.openErrorInDiscover', {
              defaultMessage: 'Open error in Discover',
            })}
            indexType="error"
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            queryParams={{
              kuery,
              serviceName: error?.service?.name,
              errorGroupId: groupId,
              errorId: error?.error?.id,
              sortDirection: 'DESC',
            }}
            ebt={{ element: ERROR_GROUP_DETAILS_EBT_ELEMENTS.SAMPLE_DETAIL_HEADER }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      {isLoading ? (
        <EuiFlexItem grow={false}>
          <EuiSpacer size="s" />
          <EuiSkeletonText lines={2} data-test-sub="loading-content" />
        </EuiFlexItem>
      ) : (
        <Summary
          items={[
            <Timestamp
              timestamp={errorData && error ? getTimestampUs(error) / 1000 : 0}
              renderMode="tooltip"
            />,
            errorUrl ? (
              <HttpInfoSummaryItem url={errorUrl} method={method} status={status} />
            ) : null,
            userAgent?.name ? <UserAgentSummaryItem {...userAgent} /> : null,
            transaction && (
              <EuiToolTip
                content={i18n.translate('xpack.apm.errorSampleDetails.relatedTransactionSample', {
                  defaultMessage: 'Related transaction sample',
                })}
              >
                <TransactionDetailLink
                  transactionName={transaction.transaction.name}
                  href={router.link('/services/{serviceName}/transactions/view', {
                    path: { serviceName: transaction.service.name },
                    query: {
                      ...query,
                      traceId: transaction.trace.id,
                      transactionId: transaction.transaction.id,
                      transactionName: transaction.transaction.name,
                      transactionType: transaction.transaction.type,
                      comparisonEnabled: defaultComparisonEnabled,
                      showCriticalPath: false,
                      offset,
                      kuery,
                    },
                  })}
                >
                  <EuiIcon type="merge" aria-hidden={true} />
                  <TransactionLinkName>{transaction.transaction.name}</TransactionLinkName>
                </TransactionDetailLink>
              </EuiToolTip>
            ),
            <EuiToolTip
              content={i18n.translate('xpack.apm.errorSampleDetails.serviceEnvironment', {
                defaultMessage: 'Environment',
              })}
            >
              <EuiBadge color="hollow" tabIndex={0}>
                {getEnvironmentLabel(errorEnvironment)}
              </EuiBadge>
            </EuiToolTip>,
            serviceVersion ? (
              <EuiToolTip
                content={i18n.translate('xpack.apm.errorSampleDetails.serviceVersion', {
                  defaultMessage: 'Service version',
                })}
              >
                <EuiBadge color="hollow" tabIndex={0}>
                  {serviceVersion}
                </EuiBadge>
              </EuiToolTip>
            ) : null,
            isUnhandled ? (
              <EuiBadge color="warning">
                {i18n.translate('xpack.apm.errorGroupDetails.unhandledLabel', {
                  defaultMessage: 'Unhandled',
                })}
              </EuiBadge>
            ) : null,
          ]}
        />
      )}

      <EuiSpacer />
      {!isLoading && (
        <>
          <EuiTitle size="xxs">
            <h4>
              {i18n.translate('xpack.apm.errorSampleDetails.issueContextTitle', {
                defaultMessage: 'Issue context',
              })}
            </h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiDescriptionList
            type="responsiveColumn"
            columnWidths={['20%', '80%']}
            listItems={issueContextItems}
          />
          <EuiSpacer />
        </>
      )}

      {isLoading ? (
        <EuiFlexItem grow={false}>
          <EuiSpacer size="s" />
          <EuiSkeletonText lines={3} data-test-sub="loading-content" />
        </EuiFlexItem>
      ) : (
        <SampleSummary error={error} />
      )}

      {ErrorSampleAiInsight && error && (
        <ErrorSampleAiInsight
          errorId={error?.error?.id}
          serviceName={error?.service?.name ?? transaction?.service?.name}
          start={start}
          end={end}
          environment={environment}
        />
      )}
      <ErrorSampleContextualInsight error={error} transaction={transaction} />

      <EuiTabs>
        {tabs.map(({ key, label }) => {
          return (
            <EuiTab
              onClick={() => {
                history.replace({
                  ...history.location,
                  search: fromQuery({
                    ...toQuery(history.location.search),
                    detailTab: key,
                  }),
                });
              }}
              isSelected={currentTab.key === key}
              key={key}
            >
              {label}
            </EuiTab>
          );
        })}
      </EuiTabs>
      <EuiSpacer />
      {isLoading || !error ? (
        <EuiSkeletonText lines={3} data-test-sub="loading-content" />
      ) : (
        <ErrorSampleDetailTabContent error={error} currentTab={currentTab} />
      )}
    </EuiPanel>
  );
}

export function ErrorSampleDetailTabContent({
  error,
  currentTab,
}: {
  error: {
    service?: {
      language?: {
        name?: string;
      };
    };
    [AT_TIMESTAMP]: string;
    error: Pick<APMError['error'], 'id' | 'log' | 'stack_trace' | 'exception'>;
  };
  currentTab: ErrorTab;
}) {
  const codeLanguage = error?.service?.language?.name;
  const exceptions = error?.error?.exception || [];
  const hasExceptions = exceptions.length > 0;
  const logStackframes = error?.error?.log?.stacktrace;
  const isPlaintextException = hasExceptions
    ? !!error?.error?.stack_trace && exceptions.length === 1 && !exceptions[0].stacktrace
    : !!error?.error?.stack_trace;

  switch (currentTab.key) {
    case ErrorTabKey.LogStackTrace:
      return <Stacktrace stackframes={logStackframes} codeLanguage={codeLanguage} />;
    case ErrorTabKey.ExceptionStacktrace:
      return isPlaintextException ? (
        <PlaintextStacktrace
          message={hasExceptions ? exceptions[0]?.message : undefined}
          type={hasExceptions ? exceptions[0]?.type : undefined}
          stacktrace={error?.error?.stack_trace}
          codeLanguage={codeLanguage}
        />
      ) : (
        <ExceptionStacktrace codeLanguage={codeLanguage} exceptions={exceptions} />
      );
    default:
      return <ErrorMetadata error={error} />;
  }
}
