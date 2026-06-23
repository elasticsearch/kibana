/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiFieldSearch, EuiFlexGroup, EuiFlexItem, EuiSelect } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import useDebounce from 'react-use/lib/useDebounce';
import type { PolicyExecutionOutcomeFilter } from '@kbn/alerting-v2-schemas';

const SEARCH_DEBOUNCE_MS = 300;

const OUTCOME_OPTIONS: Array<{ value: PolicyExecutionOutcomeFilter; text: string }> = [
  {
    value: 'all',
    text: i18n.translate('xpack.alertingV2.executionHistory.searchBar.outcome.all', {
      defaultMessage: 'All',
    }),
  },
  {
    value: 'dispatched',
    text: i18n.translate('xpack.alertingV2.executionHistory.searchBar.outcome.dispatched', {
      defaultMessage: 'Dispatched',
    }),
  },
  {
    value: 'throttled',
    text: i18n.translate('xpack.alertingV2.executionHistory.searchBar.outcome.throttled', {
      defaultMessage: 'Throttled',
    }),
  },
];

interface ExecutionHistorySearchBarProps {
  onSearchChange: (search: string) => void;
  outcome: PolicyExecutionOutcomeFilter;
  onOutcomeChange: (outcome: PolicyExecutionOutcomeFilter) => void;
}

export const ExecutionHistorySearchBar = ({
  onSearchChange,
  outcome,
  onOutcomeChange,
}: ExecutionHistorySearchBarProps) => {
  const [searchInput, setSearchInput] = useState('');

  useDebounce(
    () => {
      onSearchChange(searchInput);
    },
    SEARCH_DEBOUNCE_MS,
    [onSearchChange, searchInput]
  );

  return (
    <EuiFlexGroup gutterSize="s" direction="row" responsive={false} css={{ flexGrow: 0 }}>
      <EuiFlexItem grow>
        <EuiFieldSearch
          compressed
          fullWidth
          data-test-subj="executionHistorySearchBar"
          placeholder={i18n.translate(
            'xpack.alertingV2.executionHistory.searchBar.searchPlaceholder',
            { defaultMessage: 'Search execution history...' }
          )}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label={i18n.translate(
            'xpack.alertingV2.executionHistory.searchBar.searchAriaLabel',
            { defaultMessage: 'Search execution history by policy or rule' }
          )}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSelect
          compressed
          data-test-subj="executionHistoryOutcomeFilter"
          options={OUTCOME_OPTIONS}
          value={outcome}
          onChange={(e) => onOutcomeChange(e.target.value as PolicyExecutionOutcomeFilter)}
          prepend={i18n.translate('xpack.alertingV2.executionHistory.searchBar.outcomeLabel', {
            defaultMessage: 'Outcome',
          })}
          aria-label={i18n.translate(
            'xpack.alertingV2.executionHistory.searchBar.outcomeAriaLabel',
            { defaultMessage: 'Filter by outcome' }
          )}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
