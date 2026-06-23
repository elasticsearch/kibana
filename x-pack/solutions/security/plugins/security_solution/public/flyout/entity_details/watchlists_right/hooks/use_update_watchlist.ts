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
import type { SourceType } from './rule_based_source_helpers';

export interface UseUpdateWatchlistOptions {
  watchlistId?: string;
  ruleBasedSourceIds: Partial<Record<SourceType, string>>;
  watchlist: CreateWatchlistRequestBodyInput;
  spaceId?: string;
  onSuccess?: () => void;
}

export const useUpdateWatchlist = ({
  watchlistId,
  ruleBasedSourceIds,
  watchlist,
  spaceId,
  onSuccess,
}: UseUpdateWatchlistOptions) => {
  const queryClient = useQueryClient();
  const {
    notifications: { toasts },
  } = useKibana().services;
  const {
    updateWatchlist,
    updateWatchlistEntitySource,
    createWatchlistEntitySource,
    deleteWatchlistEntitySource,
  } = useEntityAnalyticsRoutes();

  return useMutation({
    mutationFn: async () => {
      if (!watchlistId) {
        throw new Error('Missing watchlist id');
      }

      // Process entity sources first so that in case of privilege errors, the watchlist is not modified
      const isRuleBasedType = (t: string): t is SourceType => t === 'store' || t === 'index';
      const deletedIds = new Set<string>();

      for (const source of watchlist.entitySources ?? []) {
        const sourceType = source.type ?? 'index';
        // Only process rule-based sources; integration sources are managed separately
        if (isRuleBasedType(sourceType)) {
          const sourceBody = {
            name: source.name,
            indexPattern: source.indexPattern,
            identifierField: source.identifierField,
            queryRule: source.queryRule,
            enabled: source.enabled,
            ...(sourceType === 'index' ? { range: source.range } : {}),
          };

          const sameTypeId = ruleBasedSourceIds[sourceType];
          const otherType: SourceType = sourceType === 'store' ? 'index' : 'store';
          const otherTypeId = ruleBasedSourceIds[otherType];

          if (sameTypeId) {
            // Same type exists → update in place
            await updateWatchlistEntitySource({
              watchlistId,
              entitySourceId: sameTypeId,
              body: sourceBody,
            });
          } else {
            // Type changed → delete old source first
            if (otherTypeId) {
              await deleteWatchlistEntitySource({ watchlistId, entitySourceId: otherTypeId });
              deletedIds.add(otherTypeId);
            }
            // Create new source
            await createWatchlistEntitySource({
              watchlistId,
              body: { type: sourceType, ...sourceBody },
            });
          }
        }
      }

      // Clean up any existing rule-based sources that weren't processed above.
      // Only run when entitySources is defined (user interacted with the source section).
      // undefined means entity sources weren't modified at all.
      if (watchlist.entitySources) {
        const processedTypes = new Set<string>(watchlist.entitySources.map((s) => s.type));
        for (const [type, id] of Object.entries(ruleBasedSourceIds)) {
          if (id && !deletedIds.has(id) && !processedTypes.has(type)) {
            await deleteWatchlistEntitySource({ watchlistId, entitySourceId: id });
          }
        }
      }

      // Update the watchlist metadata only after entity sources have succeeded
      const updatedWatchlist = await updateWatchlist({ id: watchlistId, body: watchlist });

      return updatedWatchlist;
    },
    onSuccess: async () => {
      toasts.addSuccess({
        title: i18n.translate(
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.updateSuccessTitle',
          {
            defaultMessage: 'Watchlist updated successfully',
          }
        ),
        text: i18n.translate(
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.updateSuccessText',
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
      // Also invalidate the entity sources cache so re-opening the edit flyout shows fresh data
      await queryClient.invalidateQueries({
        queryKey: ['watchlist-entity-sources', watchlistId],
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toasts.addError(error, {
        title: i18n.translate(
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.updateError',
          {
            defaultMessage: 'Failed to update watchlist',
          }
        ),
        toastMessage: getApiErrorMessage(error),
      });
    },
  });
};
