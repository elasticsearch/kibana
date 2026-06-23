/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { useMutation, useQueryClient } from '@kbn/react-query';
import type { CreateWatchlistRequestBodyInput } from '../../../../../common/api/entity_analytics/watchlists/management/create.gen';
import { useKibana } from '../../../../common/lib/kibana';
import { useEntityAnalyticsRoutes } from '../../../../entity_analytics/api/api';
import { getApiErrorMessage } from '../utils';

export interface UseCreateWatchlistOptions {
  watchlist: CreateWatchlistRequestBodyInput;
  spaceId?: string;
  onSuccess?: () => void;
}

export const useCreateWatchlist = ({
  watchlist,
  spaceId,
  onSuccess,
}: UseCreateWatchlistOptions) => {
  const queryClient = useQueryClient();
  const {
    notifications: { toasts },
  } = useKibana().services;
  const { createWatchlist } = useEntityAnalyticsRoutes();

  return useMutation({
    mutationFn: () => createWatchlist(watchlist),
    onSuccess: async () => {
      toasts.addSuccess({
        title: i18n.translate(
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.createSuccessTitle',
          {
            defaultMessage: 'Watchlist created successfully',
          }
        ),
        text: i18n.translate(
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.createSuccessText',
          {
            defaultMessage: 'Entities in the Watchlist may take a few minutes to synchronize.',
          }
        ),
      });
      if (spaceId) {
        await queryClient.invalidateQueries({
          queryKey: ['watchlists-management-table', spaceId],
        });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['watchlists-management-table'] });
      }
      onSuccess?.();
    },
    onError: (error: Error) => {
      toasts.addError(error, {
        title: i18n.translate(
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.createError',
          {
            defaultMessage: 'Failed to create watchlist',
          }
        ),
        toastMessage: getApiErrorMessage(error),
      });
    },
  });
};
