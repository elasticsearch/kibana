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
  EuiButton,
  EuiCallOut,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPageHeader,
  EuiSpacer,
  EuiSwitch,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { useQuery } from '@kbn/react-query';
import { FormattedMessage } from '@kbn/i18n-react';
import { useDebouncedValue } from '@kbn/react-hooks';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { FindRulesResponse, RuleResponse } from '@kbn/alerting-v2-schemas';
import { useHistory } from 'react-router-dom';
import { useKibana } from '../../common/lib/kibana';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { RULES_V2_CREATE_PATH } from '../../../common/constants';
import { useToggleRuleEnabled } from '../hooks/use_toggle_rule_enabled';
import * as i18n from '../translations';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PER_PAGE = 20;
const SIEM_OWNER_FILTER = 'metadata.owner: siem';

export const RulesV2ListPage = () => {
  const { http } = useKibana().services;
  const history = useHistory();

  const toggleEnabledMutation = useToggleRuleEnabled();

  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);

  const { data, isLoading, isError, error } = useQuery(
    ['rulesV2List', page, perPage, debouncedSearch],
    () =>
      http.get<FindRulesResponse>(ALERTING_V2_RULE_API_PATH, {
        query: {
          page: page + 1,
          perPage,
          filter: SIEM_OWNER_FILTER,
          search: debouncedSearch || undefined,
          sortField: 'name',
          sortOrder: 'asc',
        },
      }),
    { keepPreviousData: true }
  );

  const onTableChange = useCallback(({ page: tablePage }: CriteriaWithPagination<RuleResponse>) => {
    if (tablePage) {
      setPage(tablePage.index);
      setPerPage(tablePage.size);
    }
  }, []);

  const columns = useMemo<Array<EuiBasicTableColumn<RuleResponse>>>(
    () => [
      {
        field: 'metadata.name',
        name: 'Name',
        sortable: true,
        render: (name: string, rule: RuleResponse) => (
          <EuiLink
            onClick={() => history.push(`/rules_v2/view/${rule.id}`)}
            data-test-subj={`rulesV2RuleLink-${rule.id}`}
          >
            {name}
          </EuiLink>
        ),
      },
      {
        field: 'enabled',
        name: 'Enabled',
        width: '90px',
        render: (enabled: boolean, rule: RuleResponse) => (
          <EuiSwitch
            label={enabled ? i18n.DISABLE_RULE : i18n.ENABLE_RULE}
            showLabel={false}
            checked={enabled}
            onChange={() => toggleEnabledMutation.mutate({ id: rule.id, enabled: !enabled })}
            compressed
            data-test-subj={`ruleSwitch-${rule.id}`}
          />
        ),
      },
      {
        field: 'metadata.tags',
        name: 'Tags',
        render: (tags: string[] | undefined) =>
          tags?.map((tag) => (
            <EuiBadge key={tag} color="hollow">
              {tag}
            </EuiBadge>
          )) ?? null,
      },
      {
        field: 'schedule.every',
        name: 'Schedule',
        width: '120px',
      },
    ],
    [history, toggleEnabledMutation]
  );

  const pagination = useMemo(
    () => ({
      pageIndex: page,
      pageSize: perPage,
      totalItemCount: data?.total ?? 0,
      pageSizeOptions: [10, 20, 50],
    }),
    [page, perPage, data?.total]
  );

  return (
    <SecuritySolutionPageWrapper>
      <EuiPageHeader
        pageTitle={i18n.PAGE_TITLE}
        rightSideItems={[
          <EuiButton
            key="create-rule"
            fill
            onClick={() => history.push(RULES_V2_CREATE_PATH)}
            data-test-subj="rulesV2CreateRuleButton"
          >
            {i18n.CREATE_RULE}
          </EuiButton>,
        ]}
      />
      <EuiSpacer size="m" />

      {isError && (
        <>
          <EuiCallOut title={i18n.LOAD_ERROR} color="danger" iconType="error">
            {error instanceof Error ? error.message : String(error)}
          </EuiCallOut>
          <EuiSpacer />
        </>
      )}

      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            isClearable
            value={searchInput}
            placeholder={i18n.SEARCH_PLACEHOLDER}
            onChange={(e) => setSearchInput(e.target.value)}
            data-test-subj="rulesV2SearchBar"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiBasicTable<RuleResponse>
        items={data?.items ?? []}
        columns={columns}
        pagination={pagination}
        onChange={onTableChange}
        loading={isLoading}
        data-test-subj="rulesV2Table"
        noItemsMessage={
          <FormattedMessage
            id="xpack.securitySolution.rulesV2.noRules"
            defaultMessage="No rules found"
          />
        }
      />
    </SecuritySolutionPageWrapper>
  );
};
