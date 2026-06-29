/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type SetStateAction,
} from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFilterGroup,
  EuiFieldSearch,
  EuiSuperDatePicker,
  useEuiTheme,
} from '@elastic/eui';
import type { EpisodesFilterState } from '@kbn/alerting-v2-episodes-ui/queries/episodes_query';
import type { TimeRange } from '@kbn/es-query';
import { AlertEpisodesStatusFilter } from '@kbn/alerting-v2-episodes-ui/components/filters/status_filter';
import { AlertEpisodesSeverityFilter } from '@kbn/alerting-v2-episodes-ui/components/filters/severity_filter';
import { AlertEpisodesRuleFilter } from '@kbn/alerting-v2-episodes-ui/components/filters/rule_filter';
import { AlertEpisodesTagFilter } from '@kbn/alerting-v2-episodes-ui/components/filters/tag_filter';
import { AlertEpisodesAssigneeFilter } from '@kbn/alerting-v2-episodes-ui/components/filters/assignee_filter';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { HttpStart } from '@kbn/core-http-browser';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import useDebounce from 'react-use/lib/useDebounce';
import { css } from '@emotion/react';
import * as i18n from '../translations';

export interface EpisodesFilterBarProps {
  filterState: EpisodesFilterState;
  onFilterChange: (update: SetStateAction<EpisodesFilterState>) => void;
  timeRange: TimeRange;
  onTimeChange: (range: TimeRange) => void;
  ruleOptions: Array<{ label: string; value: string }>;
  assigneeUids: string[];
  onRefresh?: () => void;
  isLoading?: boolean;
  services: { http: HttpStart; expressions: ExpressionsStart; spaces: SpacesPluginStart };
}

export const EpisodesFilterBar = ({
  filterState,
  onFilterChange,
  timeRange,
  onTimeChange,
  ruleOptions,
  assigneeUids,
  onRefresh,
  isLoading = false,
  services,
}: EpisodesFilterBarProps) => {
  const { euiTheme } = useEuiTheme();
  const [queryStringInput, setQueryStringInput] = useState(filterState.queryString ?? '');

  useEffect(() => {
    setQueryStringInput(filterState.queryString ?? '');
  }, [filterState.queryString]);

  useDebounce(
    () => {
      const trimmedValue = queryStringInput.trim() || undefined;
      onFilterChange((prev) =>
        trimmedValue !== prev.queryString ? { ...prev, queryString: trimmedValue } : prev
      );
    },
    300,
    [queryStringInput]
  );

  const onStatusChange = useCallback(
    (status: string | undefined) => {
      onFilterChange((prev) => ({ ...prev, status }));
    },
    [onFilterChange]
  );

  const onSeveritiesChange = useCallback(
    (severity: string[] | undefined) => {
      onFilterChange((prev) => ({ ...prev, severity }));
    },
    [onFilterChange]
  );

  const onRuleChange = useCallback(
    (ruleId: string | undefined) => {
      onFilterChange((prev) => ({ ...prev, ruleId }));
    },
    [onFilterChange]
  );

  const onTagsChange = useCallback(
    (tags: string[] | undefined) => {
      onFilterChange((prev) => ({ ...prev, tags }));
    },
    [onFilterChange]
  );

  const onAssigneeChange = useCallback(
    (assigneeUid: string | undefined) => {
      onFilterChange((prev) => ({ ...prev, assigneeUid }));
    },
    [onFilterChange]
  );

  const onKueryChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setQueryStringInput(e.target.value);
  }, []);

  return (
    <EuiFlexGroup alignItems="center" gutterSize="s" wrap>
      <EuiFlexItem grow>
        <EuiFieldSearch
          fullWidth
          compressed
          placeholder={i18n.EPISODES_FILTER_BAR_SEARCH_PLACEHOLDER}
          value={queryStringInput}
          onChange={onKueryChange}
          data-test-subj="episodesFilterBar-search"
          css={css`
            // When opening the details push flyout the filters bar shrinks, this ensures
            // that the search bar keeps a minimum size for typing ergonomics
            min-width: ${euiTheme.base * 20}px;
          `}
        />
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiFilterGroup compressed>
              <AlertEpisodesStatusFilter
                selectedStatus={filterState.status}
                onStatusChange={onStatusChange}
                data-test-subj="episodesFilterBar-status"
              />

              <AlertEpisodesSeverityFilter
                selectedSeverities={filterState.severity}
                onSeveritiesChange={onSeveritiesChange}
                data-test-subj="episodesFilterBar-severity"
              />

              <AlertEpisodesRuleFilter
                selectedRuleId={filterState.ruleId}
                onRuleChange={onRuleChange}
                ruleOptions={ruleOptions}
                data-test-subj="episodesFilterBar-rule"
                services={services}
              />

              <AlertEpisodesTagFilter
                selectedTags={filterState.tags}
                onTagsChange={onTagsChange}
                services={services}
                timeRange={timeRange}
                data-test-subj="episodesFilterBar-tags"
              />

              <AlertEpisodesAssigneeFilter
                selectedAssigneeUid={filterState.assigneeUid}
                onAssigneeChange={onAssigneeChange}
                assigneeUids={assigneeUids}
                data-test-subj="episodesFilterBar-assignee"
              />
            </EuiFilterGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSuperDatePicker
          compressed
          start={timeRange.from}
          end={timeRange.to}
          onTimeChange={({ start, end }) => onTimeChange({ from: start, to: end })}
          onRefresh={onRefresh}
          isLoading={isLoading}
          showUpdateButton="iconOnly"
          updateButtonProps={{
            fill: false,
          }}
          width="auto"
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
