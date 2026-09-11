/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { AppHeaderMenu } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { useMemo } from 'react';

export function useAutoRefreshOverflowItem({
  isAutoRefreshing,
  onToggle,
}: {
  isAutoRefreshing: boolean;
  onToggle: () => void;
}): NonNullable<AppHeaderMenu['items']>[number] {
  return useMemo(
    () =>
      isAutoRefreshing
        ? {
            id: 'autoRefresh',
            label: i18n.translate('xpack.slo.slosPage.stopRefreshingButtonLabel', {
              defaultMessage: 'Stop refreshing',
            }),
            iconType: 'pause',
            overflow: true,
            testId: 'autoRefreshButton',
            run: onToggle,
          }
        : {
            id: 'autoRefresh',
            label: i18n.translate('xpack.slo.slosPage.autoRefreshButtonLabel', {
              defaultMessage: 'Auto-refresh',
            }),
            iconType: 'refresh',
            overflow: true,
            testId: 'autoRefreshButton',
            run: onToggle,
          },
    [isAutoRefreshing, onToggle]
  );
}
