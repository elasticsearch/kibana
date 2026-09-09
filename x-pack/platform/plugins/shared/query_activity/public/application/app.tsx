/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { AppHeader, type AppHeaderBadge, type AppHeaderMenu } from '@kbn/app-header';
import { CANCELLATION_POLL_INTERVAL_MS, PLUGIN_NAME } from '../../common/constants';
import {
  getStopRequestedTaskIds,
  pruneStopRequestedTasks,
} from '../lib/stop_requested_tasks_storage';
import { useBreadcrumbs } from './hooks/use_breadcrumbs';
import { useQueryActivityAppContext } from './app_context';
import { QueryActivityTable } from './components/query_activity_table';
import { QueryActivityNoAccessPrompt } from './no_access_prompt';

const getLastUpdatedLabel = (secondsAgo: number): string =>
  secondsAgo < 60
    ? i18n.translate('xpack.queryActivity.lastUpdatedLessThanOneMinute', {
        defaultMessage: 'Updated <1m ago',
      })
    : i18n.translate('xpack.queryActivity.lastUpdatedMinutes', {
        defaultMessage: 'Updated {minutes} min ago',
        values: { minutes: Math.floor(secondsAgo / 60) },
      });

const QueryActivityPageHeader: React.FC<{
  lastUpdatedLabel?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}> = ({ lastUpdatedLabel, isRefreshing, onRefresh }) => {
  const { docLinks } = useQueryActivityAppContext();

  const badges = useMemo<AppHeaderBadge[] | undefined>(
    () =>
      lastUpdatedLabel
        ? [
            {
              color: 'hollow',
              label: lastUpdatedLabel,
              'data-test-subj': 'queryActivityLastUpdatedBadge',
            },
          ]
        : undefined,
    [lastUpdatedLabel]
  );

  const menu = useMemo<AppHeaderMenu | undefined>(() => {
    if (!onRefresh) {
      return undefined;
    }

    return {
      primaryActionItem: {
        id: 'refresh',
        iconType: 'refresh',
        isLoading: isRefreshing,
        label: i18n.translate('xpack.queryActivity.refreshButton', {
          defaultMessage: 'Refresh',
        }),
        run: onRefresh,
        testId: 'queryActivityRefreshButton',
      },
    };
  }, [isRefreshing, onRefresh]);

  return (
    <AppHeader
      title={PLUGIN_NAME}
      description={{
        text: i18n.translate('xpack.queryActivity.subtitle', {
          defaultMessage:
            'Real-time visibility and control over queries currently running in your cluster.',
        }),
        learnMoreUrl: docLinks.links.management.queryActivity,
      }}
      badges={badges}
      menu={menu}
      spacing="bleed"
    />
  );
};

const QueryActivityAppWithData: React.FC = () => {
  const { apiService, notifications } = useQueryActivityAppContext();
  const { data, isLoading, error, resendRequest } = apiService.useLoadQueryActivity();

  const [lastRefreshTime, setLastRefreshTime] = useState(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  // Tracks task IDs for which a cancel request has been sent but the task hasn't
  // disappeared from the API yet. Initialized from localStorage so that if the user
  // navigates away and back mid-cancellation, polling resumes automatically.
  const [pendingCancellations, setPendingCancellations] = useState<Set<string>>(() =>
    getStopRequestedTaskIds()
  );
  // Ref kept in sync with state so the polling interval can always read the current
  // set without it being a stale closure value.
  const pendingCancellationsRef = useRef(pendingCancellations);
  pendingCancellationsRef.current = pendingCancellations;

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastRefreshTime]);

  // While there are pending cancellations, silently poll the search API every 5s to
  // check whether those tasks have disappeared (i.e. the cancellation completed).
  // We intentionally do NOT call resendRequest() on every tick — that would update
  // the visible query list on each poll. We only update the visible list once we
  // confirm that at least one pending task is gone, which is the meaningful moment
  // to refresh.
  useEffect(() => {
    if (pendingCancellations.size === 0) return;

    const intervalId = setInterval(async () => {
      const { data: pollData } = await apiService.fetchQueryActivity();
      const currentTaskIds = new Set((pollData?.queries ?? []).map((q) => q.taskId));
      const current = pendingCancellationsRef.current;
      // Determine which of the tracked cancellations are still present in the task list.
      const stillPending = new Set([...current].filter((id) => currentTaskIds.has(id)));

      if (stillPending.size !== current.size) {
        // At least one cancelled task has disappeared. Clean up localStorage (which
        // removes the "Stopping the query…" label on re-render), shrink the pending
        // set (which stops polling once empty), and refresh the visible list.
        pruneStopRequestedTasks({ validTaskIds: currentTaskIds });
        setPendingCancellations(stillPending);
        resendRequest();
        setLastRefreshTime(Date.now());
      }
    }, CANCELLATION_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [pendingCancellations.size, apiService, resendRequest]);

  const handleRefresh = useCallback(() => {
    resendRequest();
    setLastRefreshTime(Date.now());
  }, [resendRequest]);

  const handleCancelQuery = useCallback(
    async (taskId: string): Promise<boolean> => {
      try {
        const { error: cancelError } = await apiService.cancelTask(taskId);

        if (cancelError) {
          notifications.toasts.addDanger(
            i18n.translate('xpack.queryActivity.stopQueryErrorToast', {
              defaultMessage: 'Failed to cancel query {taskId}',
              values: { taskId },
            })
          );
          return false;
        }

        notifications.toasts.addSuccess(
          i18n.translate('xpack.queryActivity.stopQueryToast', {
            defaultMessage: 'Cancellation requested for query {taskId}',
            values: { taskId },
          })
        );

        setPendingCancellations((prev) => new Set([...prev, taskId]));
        resendRequest();
        setLastRefreshTime(Date.now());
        return true;
      } catch {
        notifications.toasts.addDanger(
          i18n.translate('xpack.queryActivity.stopQueryErrorToast', {
            defaultMessage: 'Failed to cancel query {taskId}',
            values: { taskId },
          })
        );
        return false;
      }
    },
    [apiService, notifications, resendRequest]
  );

  const queries = data?.queries ?? [];

  return (
    <>
      <QueryActivityPageHeader
        lastUpdatedLabel={getLastUpdatedLabel(secondsAgo)}
        isRefreshing={isLoading}
        onRefresh={handleRefresh}
      />
      <EuiSpacer size="l" />
      <QueryActivityTable
        queries={queries}
        onCancelQuery={handleCancelQuery}
        onQueryNoLongerRunning={handleRefresh}
        isLoading={isLoading}
        error={
          error
            ? i18n.translate('xpack.queryActivity.loadError', {
                defaultMessage: 'Failed to load query activity.',
              })
            : undefined
        }
      />
    </>
  );
};

export const QueryActivityApp: React.FC = () => {
  useBreadcrumbs();

  const { capabilities } = useQueryActivityAppContext();

  if (capabilities.isLoading) {
    return (
      <>
        <QueryActivityPageHeader />
        <EuiSpacer size="l" />
        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  }

  if (!capabilities.canViewTasks) {
    return (
      <>
        <QueryActivityPageHeader />
        <EuiSpacer size="l" />
        <QueryActivityNoAccessPrompt
          missingClusterPrivileges={capabilities.missingClusterPrivileges}
        />
      </>
    );
  }

  return <QueryActivityAppWithData />;
};
