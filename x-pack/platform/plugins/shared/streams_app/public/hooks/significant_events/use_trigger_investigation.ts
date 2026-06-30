/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { useKibana } from '../use_kibana';

interface TriggerInvestigationResult {
  executionId: string;
}

const TRIGGER_SUCCESS_TOAST_TITLE = i18n.translate(
  'xpack.streams.sigEventsTab.triggerInvestigation.successToastTitle',
  {
    defaultMessage: 'Investigation started',
  }
);

const TRIGGER_SUCCESS_TOAST_TEXT = i18n.translate(
  'xpack.streams.sigEventsTab.triggerInvestigation.successToastText',
  {
    defaultMessage:
      'The investigation workflow has been triggered. Results will appear once it completes.',
  }
);

const TRIGGER_ERROR_TOAST_TITLE = i18n.translate(
  'xpack.streams.sigEventsTab.triggerInvestigation.errorToastTitle',
  {
    defaultMessage: 'Failed to start investigation',
  }
);

export const useTriggerInvestigation = ({
  onTriggerSuccess,
}: { onTriggerSuccess?: () => void } = {}) => {
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

  const mutation = useMutation<TriggerInvestigationResult, Error, string>({
    mutationFn: (eventId: string) =>
      streamsRepositoryClient.fetch('POST /internal/sig_events/events/{id}/investigate', {
        params: { path: { id: eventId } },
        signal: null,
      }),
    onSuccess: () => {
      toasts.addSuccess({
        title: TRIGGER_SUCCESS_TOAST_TITLE,
        text: TRIGGER_SUCCESS_TOAST_TEXT,
      });
      onTriggerSuccess?.();
    },
    onError: (error) => {
      toasts.addError(error, { title: TRIGGER_ERROR_TOAST_TITLE });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['significantEventLifecycle'],
        exact: false,
      });
    },
  });

  return {
    triggerInvestigation: (eventId: string) => mutation.mutate(eventId),
    isTriggering: mutation.isLoading,
  };
};
