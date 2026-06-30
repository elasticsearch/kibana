/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiSelect,
  EuiSpacer,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import moment from 'moment';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { asDuration } from '@kbn/alerts-ui-shared';
import { useAlertingRulesCache } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_rules_cache';
import type { RuleExecutionOutcome, RuleExecutionView } from '@kbn/alerting-v2-schemas';
import { RULE_EXECUTIONS_MAX_RESULT_WINDOW } from '@kbn/alerting-v2-schemas';
import { useFetchRuleExecutions } from '../../../hooks/use_fetch_rule_executions';
import { FilteredEmptyState, RulesEmptyState } from './empty_state';
import { ExecutionHistoryErrorState } from './error_state';

const DEFAULT_PER_PAGE = 10;

const noFlexGrowCss = css`
  flex-grow: 0;
`;

type RuleOutcomeFilter = 'all' | RuleExecutionOutcome;

const toOutcomeParam = (filter: RuleOutcomeFilter): RuleExecutionOutcome[] | undefined =>
  filter === 'all' ? undefined : [filter];

const OUTCOME_OPTIONS: Array<{ value: RuleOutcomeFilter; text: string }> = [
  {
    value: 'all',
    text: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.outcome.all', {
      defaultMessage: 'All',
    }),
  },
  {
    value: 'success',
    text: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.outcome.success', {
      defaultMessage: 'Success',
    }),
  },
  {
    value: 'failure',
    text: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.outcome.failure', {
      defaultMessage: 'Failure',
    }),
  },
];

const MS_TO_US = 1000;

const buildColumns = (
  dateTimeFormat: string,
  onRuleClick: (ruleId: string) => void,
  rulesCache: Record<string, { metadata: { name: string } }>
): Array<EuiBasicTableColumn<RuleExecutionView>> => [
  {
    field: 'startedAt',
    name: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.columns.timestamp', {
      defaultMessage: 'Timestamp',
    }),
    width: '15%',
    render: (value: string) => moment(value).format(dateTimeFormat),
  },
  {
    name: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.columns.rule', {
      defaultMessage: 'Rule',
    }),
    width: '15%',
    render: (item: RuleExecutionView) => {
      const ruleName = rulesCache[item.rule.id]?.metadata?.name;
      return ruleName != null ? (
        <EuiButtonEmpty
          size="xs"
          flush="left"
          onClick={() => onRuleClick(item.rule.id)}
          data-test-subj={`ruleExecutionHistoryRuleLink-${item.rule.id}`}
        >
          {ruleName}
        </EuiButtonEmpty>
      ) : (
        item.rule.id
      );
    },
  },
  {
    name: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.columns.duration', {
      defaultMessage: 'Duration',
    }),
    width: '10%',
    render: (item: RuleExecutionView) => asDuration(item.timings.duration * MS_TO_US),
  },
  {
    field: 'outcome',
    name: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.columns.response', {
      defaultMessage: 'Response',
    }),
    width: '10%',
    render: (outcome: RuleExecutionView['outcome']) => (
      <EuiBadge
        color={outcome === 'success' ? 'success' : 'danger'}
        iconType={outcome === 'success' ? 'check' : 'cross'}
      >
        {outcome}
      </EuiBadge>
    ),
  },
  {
    name: i18n.translate('xpack.alertingV2.executionHistory.rulesTab.columns.message', {
      defaultMessage: 'Message',
    }),
    width: '50%',
    render: (item: RuleExecutionView) =>
      item.error?.message ??
      item.reason ??
      (item.outcome === 'success'
        ? i18n.translate('xpack.alertingV2.executionHistory.rulesTab.successMessage', {
            defaultMessage: 'Rule executed successfully',
          })
        : '\u2014'),
  },
];

interface Props {
  onRuleClick: (ruleId: string) => void;
}

export const RulesTabContent = ({ onRuleClick }: Props) => {
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [outcomeFilter, setOutcomeFilter] = useState<RuleOutcomeFilter>('all');

  const { data, isFetching, isError, refetch } = useFetchRuleExecutions({
    page: page + 1,
    perPage,
    outcome: toOutcomeParam(outcomeFilter),
  });

  const http = useService(CoreStart('http'));
  const settings = useService(CoreStart('settings'));
  const dateTimeFormat = settings.client.get<string>('dateFormat');

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const ruleIds = useMemo(() => [...new Set(items.map((item) => item.rule.id))], [items]);

  const { rulesCache } = useAlertingRulesCache({
    ruleIds,
    services: { http },
  });

  const onOutcomeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setOutcomeFilter(e.target.value as RuleOutcomeFilter);
    setPage(0);
  }, []);

  const onTableChange = useCallback(
    ({ page: tablePage }: CriteriaWithPagination<RuleExecutionView>) => {
      if (tablePage) {
        setPage(tablePage.index);
        setPerPage(tablePage.size);
      }
    },
    []
  );

  const columns = useMemo(
    () => buildColumns(dateTimeFormat, onRuleClick, rulesCache),
    [dateTimeFormat, onRuleClick, rulesCache]
  );
  // Prevent pagination from exceeding the API's max result window
  const total = Math.min(data?.total ?? 0, RULE_EXECUTIONS_MAX_RESULT_WINDOW);
  const isFiltered = outcomeFilter !== 'all';

  if (isError) {
    return <ExecutionHistoryErrorState onRetry={() => refetch()} />;
  }

  return (
    <>
      <EuiFlexGroup gutterSize="s" direction="row" responsive={false} css={noFlexGrowCss}>
        <EuiFlexItem grow={false}>
          <EuiSelect
            compressed
            data-test-subj="ruleExecutionHistoryOutcomeFilter"
            options={OUTCOME_OPTIONS}
            value={outcomeFilter}
            onChange={onOutcomeChange}
            prepend={i18n.translate('xpack.alertingV2.executionHistory.rulesTab.outcomeLabel', {
              defaultMessage: 'Response',
            })}
            aria-label={i18n.translate(
              'xpack.alertingV2.executionHistory.rulesTab.outcomeAriaLabel',
              { defaultMessage: 'Filter by response' }
            )}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiBasicTable<RuleExecutionView>
        data-test-subj="ruleExecutionHistoryTable"
        tableCaption={i18n.translate('xpack.alertingV2.executionHistory.rulesTab.tableCaption', {
          defaultMessage: 'Rule execution history',
        })}
        items={items}
        columns={columns}
        loading={isFetching}
        noItemsMessage={isFiltered ? <FilteredEmptyState /> : <RulesEmptyState />}
        pagination={{
          pageIndex: page,
          pageSize: perPage,
          totalItemCount: total,
          pageSizeOptions: [10, 50, 100],
        }}
        onChange={onTableChange}
      />
    </>
  );
};
