/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { i18n } from '@kbn/i18n';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { DISCOVERY_QUERIES_QUERY_KEY } from '../../../../hooks/sig_events/use_fetch_discovery_queries';
import { useKibana } from '../../../../hooks/use_kibana';
import { useQueriesApi } from '../../../../hooks/sig_events/use_queries_api';
import { useStreamFeaturesApi } from '../../../../hooks/sig_events/use_stream_features_api';

interface UseStreamKnowledgeIndicatorsBulkDeleteParams {
  streamName: string;
  onSuccess?: () => void;
}

export function useStreamKnowledgeIndicatorsBulkDelete({
  streamName,
  onSuccess,
}: UseStreamKnowledgeIndicatorsBulkDeleteParams) {
  const {
    core: {
      notifications: { toasts },
    },
  } = useKibana();
  const queryClient = useQueryClient();
  const { deleteFeaturesInBulk } = useStreamFeaturesApi(streamName);
  const { deleteQueriesInBulk } = useQueriesApi();

  const mutation = useMutation<void, Error, KnowledgeIndicator[]>({
    mutationFn: async (knowledgeIndicators) => {
      const featureUuids = knowledgeIndicators
        .filter((knowledgeIndicator) => knowledgeIndicator.kind === 'feature')
        .map((knowledgeIndicator) => knowledgeIndicator.feature.uuid);

      const queryIds = knowledgeIndicators
        .filter((knowledgeIndicator) => knowledgeIndicator.kind === 'query')
        .map((knowledgeIndicator) => knowledgeIndicator.query.id);

      const requests: Array<Promise<void>> = [];

      if (featureUuids.length > 0) {
        requests.push(deleteFeaturesInBulk(featureUuids));
      }

      if (queryIds.length > 0) {
        requests.push(deleteQueriesInBulk({ queryIds, streamName }));
      }

      await Promise.all(requests);
    },
    onSuccess: async () => {
      onSuccess?.();

      toasts.addSuccess({
        title: BULK_DELETE_SUCCESS_TOAST_TITLE,
      });
    },
    onError: (error) => {
      toasts.addError(error, {
        title: BULK_DELETE_ERROR_TOAST_TITLE,
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: DISCOVERY_QUERIES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['features', streamName] }),
        queryClient.invalidateQueries({ queryKey: ['features', 'all'] }),
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

const BULK_DELETE_ERROR_TOAST_TITLE = i18n.translate(
  'xpack.streams.significantEventsTable.bulkDeleteErrorToastTitle',
  {
    defaultMessage: 'Failed to delete selected knowledge indicators',
  }
);

const BULK_DELETE_SUCCESS_TOAST_TITLE = i18n.translate(
  'xpack.streams.significantEventsTable.bulkDeleteSuccessToastTitle',
  {
    defaultMessage: 'Knowledge indicators deleted',
  }
);
