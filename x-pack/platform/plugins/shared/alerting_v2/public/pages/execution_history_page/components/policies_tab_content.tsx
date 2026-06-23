/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiBasicTable,
  EuiLink,
  EuiSpacer,
  EuiText,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import moment from 'moment';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { WORKFLOWS_APP_ID } from '@kbn/deeplinks-workflows';
import type { PolicyExecutionOutcomeFilter } from '@kbn/alerting-v2-schemas';
import { useCountNewExecutionHistoryEvents } from '../../../hooks/use_count_new_execution_history_events';
import { useFetchExecutionHistory } from '../../../hooks/use_fetch_execution_history';
import type { PolicyExecutionHistoryItem } from '../../../services/execution_history_api';
import { ExecutionHistorySearchBar } from './execution_history_search_bar';
import { FilteredEmptyState, PoliciesEmptyState } from './empty_state';
import { ExecutionHistoryErrorState } from './error_state';
import { NewEventsBanner } from './new_events_banner';
import { TruncatedCallout } from './truncated_callout';

const DEFAULT_PER_PAGE = 100;
const DEFAULT_OUTCOME: PolicyExecutionOutcomeFilter = 'all';

const buildColumns = (
  onPolicyClick: (policyId: string) => void,
  onRuleClick: (ruleId: string) => void,
  getWorkflowUrl: (workflowId: string) => string,
  formatTimestamp: (value: string) => string
): Array<EuiBasicTableColumn<PolicyExecutionHistoryItem>> => [
  {
    field: '@timestamp',
    name: i18n.translate('xpack.alertingV2.executionHistory.columns.timestamp', {
      defaultMessage: 'Timestamp',
    }),
    render: (value: string) => formatTimestamp(value),
  },
  {
    name: i18n.translate('xpack.alertingV2.executionHistory.columns.policy', {
      defaultMessage: 'Policy',
    }),
    render: (item: PolicyExecutionHistoryItem) => (
      <EuiLink onClick={() => onPolicyClick(item.policy.id)}>
        {item.policy.name ?? item.policy.id}
      </EuiLink>
    ),
  },
  {
    name: i18n.translate('xpack.alertingV2.executionHistory.columns.rule', {
      defaultMessage: 'Rule',
    }),
    render: (item: PolicyExecutionHistoryItem) => (
      <EuiLink onClick={() => onRuleClick(item.rule.id)}>{item.rule.name ?? item.rule.id}</EuiLink>
    ),
  },
  {
    field: 'outcome',
    name: i18n.translate('xpack.alertingV2.executionHistory.columns.outcome', {
      defaultMessage: 'Outcome',
    }),
    render: (outcome: PolicyExecutionHistoryItem['outcome']) => (
      <EuiBadge color="hollow" iconType={outcome === 'dispatched' ? 'check' : 'clock'}>
        {outcome}
      </EuiBadge>
    ),
  },
  {
    field: 'episode_count',
    name: i18n.translate('xpack.alertingV2.executionHistory.columns.episodes', {
      defaultMessage: 'Episodes',
    }),
  },
  {
    field: 'action_group_count',
    name: i18n.translate('xpack.alertingV2.executionHistory.columns.actionGroups', {
      defaultMessage: 'Action groups',
    }),
  },
  {
    field: 'workflows',
    name: i18n.translate('xpack.alertingV2.executionHistory.columns.workflows', {
      defaultMessage: 'Workflows',
    }),
    render: (workflows: PolicyExecutionHistoryItem['workflows']) => {
      if (workflows.length === 0) return null;
      return (
        <EuiBadgeGroup gutterSize="xs">
          {workflows.map((w) => (
            <EuiBadge
              key={w.id}
              color="hollow"
              iconType="workflow"
              href={getWorkflowUrl(w.id)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ maxWidth: '100%' }}
            >
              {w.name ?? w.id}
            </EuiBadge>
          ))}
        </EuiBadgeGroup>
      );
    },
  },
];

interface Props {
  onPolicyClick: (policyId: string) => void;
  onRuleClick: (ruleId: string) => void;
}

export const PoliciesTabContent = ({ onPolicyClick, onRuleClick }: Props) => {
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<PolicyExecutionOutcomeFilter>(DEFAULT_OUTCOME);
  const [lastSeenAt, setLastSeenAt] = useState(() => new Date().toISOString());
  const [isLoadingNewEvents, setIsLoadingNewEvents] = useState(false);

  const trimmedSearch = search.trim();
  const searchParam = trimmedSearch.length > 0 ? trimmedSearch : undefined;

  const { data, isFetching, isError, refetch } = useFetchExecutionHistory({
    page: page + 1,
    perPage,
    search: searchParam,
    outcome,
  });

  const { data: newCountData } = useCountNewExecutionHistoryEvents({
    since: lastSeenAt,
    search: searchParam,
    outcome,
    enabled: !isError,
  });
  const newEventsCount = newCountData?.count ?? 0;

  const application = useService(CoreStart('application'));
  const settings = useService(CoreStart('settings'));
  const dateTimeFormat = settings.client.get<string>('dateFormat');

  // Once the list refetch settles, hide the banner by advancing the lastSeenAt anchor.
  useEffect(() => {
    if (isLoadingNewEvents && !isFetching) {
      setLastSeenAt(new Date().toISOString());
      setIsLoadingNewEvents(false);
    }
  }, [isLoadingNewEvents, isFetching]);

  const onLoadNewEvents = () => {
    setIsLoadingNewEvents(true);
    setPage(0);
    refetch();
  };

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const onOutcomeChange = useCallback((value: PolicyExecutionOutcomeFilter) => {
    setOutcome(value);
    setPage(0);
  }, []);

  const onTableChange = ({
    page: tablePage,
  }: CriteriaWithPagination<PolicyExecutionHistoryItem>) => {
    if (tablePage) {
      setPage(tablePage.index);
      setPerPage(tablePage.size);
    }
  };

  const items = data?.items ?? [];
  const totalEvents = data?.totalEvents ?? 0;
  const showBanner = newEventsCount > 0 && !isError;
  const isFiltered = searchParam !== undefined || outcome !== DEFAULT_OUTCOME;

  if (isError) {
    return <ExecutionHistoryErrorState onRetry={() => refetch()} />;
  }

  const getWorkflowUrl = (workflowId: string) =>
    application.getUrlForApp(WORKFLOWS_APP_ID, { path: `/${workflowId}` });
  const formatTimestamp = (value: string) => moment(value).format(dateTimeFormat);

  const columns = buildColumns(onPolicyClick, onRuleClick, getWorkflowUrl, formatTimestamp);

  return (
    <>
      <ExecutionHistorySearchBar
        onSearchChange={onSearchChange}
        outcome={outcome}
        onOutcomeChange={onOutcomeChange}
      />
      <EuiSpacer size="m" />
      <EuiText size="s">
        <p>
          {i18n.translate('xpack.alertingV2.executionHistory.policiesTab.description', {
            defaultMessage: 'Showing dispatcher decisions from the last 24 hours.',
          })}
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      {showBanner && (
        <>
          <NewEventsBanner
            count={newEventsCount}
            isLoading={isLoadingNewEvents}
            onLoad={onLoadNewEvents}
          />
          <EuiSpacer size="m" />
        </>
      )}
      <TruncatedCallout data={data} searchParam={searchParam} />
      <EuiBasicTable<PolicyExecutionHistoryItem>
        items={items}
        columns={columns}
        loading={isFetching}
        noItemsMessage={isFiltered ? <FilteredEmptyState /> : <PoliciesEmptyState />}
        pagination={{
          pageIndex: page,
          pageSize: perPage,
          totalItemCount: totalEvents,
          pageSizeOptions: [10, 25, 50, 100],
        }}
        onChange={onTableChange}
      />
    </>
  );
};
