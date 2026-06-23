/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiProgress,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import { useKibana } from '../../hooks/use_kibana';
import { useStreamsAppFetch } from '../../hooks/use_streams_app_fetch';
import { executeEsqlQuery } from '../../hooks/use_execute_esql_query';
import { buildTopFailureReasonsEsql } from '../../util/stream_overview_esql';

interface FailureReason {
  errorType: string;
  count: number;
}

interface TopFailureReasonsProps {
  streamName: string;
  canReadFailureStore: boolean;
  failedDocs: number;
  failedDocsLoading?: boolean;
}

// Severity palette applied by rank: red → orange → subdued for the rest.
const BAR_COLORS = ['danger', 'warning', 'subdued', 'subdued', 'subdued'] as const;

function isExpectedEmptyFailureStoreError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('Unknown index') ||
    error.message.includes('index_not_found_exception') ||
    error.message.includes('Unknown column')
  );
}

export function TopFailureReasons({
  streamName,
  canReadFailureStore,
  failedDocs,
  failedDocsLoading,
}: TopFailureReasonsProps) {
  const {
    core: { uiSettings },
    dependencies: {
      start: { data },
    },
  } = useKibana();

  const failureReasonsFetch = useStreamsAppFetch(
    async ({ signal, timeState: ts }) => {
      if (!canReadFailureStore || !ts || failedDocs <= 0) return [];

      let response;
      try {
        response = await executeEsqlQuery({
          query: buildTopFailureReasonsEsql(streamName),
          search: data.search.search,
          signal,
          start: ts.start,
          end: ts.end,
          uiSettings,
        });
      } catch (error: unknown) {
        if (isExpectedEmptyFailureStoreError(error)) {
          return [];
        }
        throw error;
      }

      const errorTypeIdx = response.columns.findIndex((c) => c.name === 'error_type');
      const countIdx = response.columns.findIndex((c) => c.name === 'count');

      if (errorTypeIdx === -1 || countIdx === -1) return [];

      return response.values
        .filter((row) => row[errorTypeIdx] != null)
        .map(
          (row): FailureReason => ({
            errorType: String(row[errorTypeIdx]),
            count: (row[countIdx] as number) ?? 0,
          })
        );
    },
    [streamName, canReadFailureStore, failedDocs, data.search.search, uiSettings],
    { withTimeRange: true, withRefresh: true }
  );

  const reasons = useMemo(() => failureReasonsFetch.value ?? [], [failureReasonsFetch.value]);
  const maxCount = useMemo(() => Math.max(1, ...reasons.map((r) => r.count)), [reasons]);
  const isLoading = failedDocsLoading || failureReasonsFetch.loading;

  if (!canReadFailureStore) {
    return null;
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="none" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="s" color="subdued">
          <h4>
            {i18n.translate('xpack.streams.dataQualityCard.topFailureReasons.title', {
              defaultMessage: 'Top failure reasons',
            })}
          </h4>
        </EuiText>
        <EuiSpacer size="s" />
      </EuiFlexItem>

      {isLoading ? (
        <EuiFlexItem>
          <EuiSkeletonText lines={3} size="s" />
        </EuiFlexItem>
      ) : reasons.length === 0 ? (
        <EuiFlexItem>
          <EuiText size="s" color="subdued">
            {i18n.translate('xpack.streams.dataQualityCard.topFailureReasons.noData', {
              defaultMessage: 'No failure reasons found',
            })}
          </EuiText>
        </EuiFlexItem>
      ) : (
        reasons.map((reason, idx) => (
          <EuiFlexItem key={reason.errorType} grow={false}>
            <EuiFlexGroup alignItems="center">
              <EuiFlexItem grow>
                <EuiText size="s">
                  <p>{reason.errorType}</p>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem
                css={css`
                  max-width: 33%;
                `}
              >
                <EuiFlexGroup gutterSize="s" alignItems="center">
                  <EuiFlexItem grow>
                    <EuiProgress
                      value={reason.count}
                      max={maxCount}
                      size="m"
                      color={BAR_COLORS[idx % BAR_COLORS.length]}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>{reason.count.toLocaleString()}</EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiHorizontalRule color="subdued" margin="xs" />
          </EuiFlexItem>
        ))
      )}
    </EuiFlexGroup>
  );
}
