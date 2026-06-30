/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { i18n } from '@kbn/i18n';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { DISCOVERY_QUERIES_QUERY_KEY } from './use_fetch_discovery_queries';
import { useKibana } from '../use_kibana';
import type { BulkOperationResult } from './use_discovery_features_api';
import { useDiscoveryFeaturesApi } from './use_discovery_features_api';

interface BulkDeleteResult {
  succeeded: number;
  failed: number;
}

interface UseKnowledgeIndicatorsBulkDeleteParams {
  onSuccess?: () => void;
}

export function useKnowledgeIndicatorsBulkDelete({
  onSuccess,
}: UseKnowledgeIndicatorsBulkDeleteParams = {}) {
  const {
    core: {
      notifications: { toasts },
    },
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();
  const queryClient = useQueryClient();
  const { deleteFeaturesInBulk } = useDiscoveryFeaturesApi();

  const mutation = useMutation<BulkDeleteResult, Error, KnowledgeIndicator[]>({
    mutationFn: async (knowledgeIndicators) => {
      const features = knowledgeIndicators
        .filter((ki) => ki.kind === 'feature')
        .map((ki) => ki.feature);

      const queryIds = knowledgeIndicators
        .filter((ki) => ki.kind === 'query')
        .map((ki) => ki.query.id);

      // At most two HTTP requests regardless of how many streams are involved:
      // one for the cross-stream feature bulk delete, one for the cross-stream
      // query bulk delete. Both endpoints group by stream server-side.
      const featuresPromise: Promise<BulkOperationResult> =
        features.length > 0
          ? deleteFeaturesInBulk(features)
          : Promise.resolve({ succeededCount: 0, failedCount: 0 });

      const queriesPromise: Promise<BulkOperationResult> =
        queryIds.length > 0
          ? streamsRepositoryClient
              .fetch('POST /internal/streams/queries/_bulk_delete', {
                signal: null,
                params: { body: { queryIds } },
              })
              .then(({ succeeded, failed }) => ({
                succeededCount: succeeded,
                failedCount: failed,
              }))
          : Promise.resolve({ succeededCount: 0, failedCount: 0 });

      const [featuresSettled, queriesSettled] = await Promise.allSettled([
        featuresPromise,
        queriesPromise,
      ]);

      let succeeded = 0;
      let failed = 0;

      if (featuresSettled.status === 'fulfilled') {
        succeeded += featuresSettled.value.succeededCount;
        failed += featuresSettled.value.failedCount;
      } else {
        failed += features.length;
      }

      if (queriesSettled.status === 'fulfilled') {
        succeeded += queriesSettled.value.succeededCount;
        failed += queriesSettled.value.failedCount;
      } else {
        failed += queryIds.length;
      }

      if (succeeded === 0 && failed > 0) {
        throw new Error(BULK_DELETE_REJECTED_ERROR_MESSAGE);
      }

      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed > 0) {
        toasts.addWarning({ title: getBulkDeletePartialToastTitle(succeeded, failed) });
      } else {
        toasts.addSuccess({ title: getBulkDeleteSuccessToastTitle(succeeded) });
      }
      onSuccess?.();
    },
    onError: (error) => {
      toasts.addError(error, { title: BULK_DELETE_ERROR_TOAST_TITLE });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERIES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['features'], exact: false }),
      ]);
    },
  });

  return {
    deleteKnowledgeIndicatorsInBulk: async (knowledgeIndicators: KnowledgeIndicator[]) => {
      if (knowledgeIndicators.length === 0) {
        return;
      }
      await mutation.mutateAsync(knowledgeIndicators);
    },
    isDeleting: mutation.isLoading,
  };
}

const BULK_DELETE_REJECTED_ERROR_MESSAGE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkDeleteRejectedErrorMessage',
  {
    defaultMessage: 'Some knowledge indicators could not be deleted',
  }
);

const BULK_DELETE_ERROR_TOAST_TITLE = i18n.translate(
  'xpack.streams.knowledgeIndicators.bulkDeleteErrorToastTitle',
  {
    defaultMessage: 'Failed to delete selected knowledge indicators',
  }
);

const getBulkDeletePartialToastTitle = (succeeded: number, failed: number) =>
  i18n.translate('xpack.streams.knowledgeIndicators.bulkDeletePartialToastTitle', {
    defaultMessage:
      '{succeeded, plural, one {# knowledge indicator} other {# knowledge indicators}} deleted. {failed, plural, one {# knowledge indicator} other {# knowledge indicators}} failed.',
    values: { succeeded, failed },
  });

const getBulkDeleteSuccessToastTitle = (count: number) =>
  i18n.translate('xpack.streams.knowledgeIndicators.bulkDeleteSuccessToastTitle', {
    defaultMessage:
      '{count, plural, one {# knowledge indicator} other {# knowledge indicators}} deleted',
    values: { count },
  });
