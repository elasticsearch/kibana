/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { usePostCase } from '../../containers/use_post_case';
import { usePostPushToService } from '../../containers/use_post_push_to_service';

import type { CaseUI } from '../../containers/types';
import type { CasePostRequest } from '../../../common/types/api';
import type { UseCreateAttachments } from '../../containers/use_create_attachments';
import { useCreateAttachments } from '../../containers/use_create_attachments';
import type { CaseAttachmentsWithoutOwner } from '../../types';
import { useCreateCaseWithAttachmentsTransaction } from '../../common/apm/use_cases_transactions';
import { useApplication } from '../../common/lib/kibana/use_application';
import { useAttachEventsEBT } from '../../analytics/use_attach_events_ebt';

export interface UseSubmitCaseProps {
  afterCaseCreated?: (
    theCase: CaseUI,
    createAttachments: UseCreateAttachments['mutateAsync']
  ) => Promise<void>;
  onSuccess?: (theCase: CaseUI) => void;
  attachments?: CaseAttachmentsWithoutOwner;
}

export type UseSubmitCaseValue = ReturnType<typeof useSubmitCase>;

export const useSubmitCase = ({ attachments, afterCaseCreated, onSuccess }: UseSubmitCaseProps) => {
  const { appId } = useApplication();
  const { mutateAsync: postCase, isLoading: isPostingCase } = usePostCase();
  const { mutateAsync: createAttachments, isLoading: isCreatingAttachments } =
    useCreateAttachments();
  const { mutateAsync: pushCaseToExternalService, isLoading: isPushingToExternalService } =
    usePostPushToService();
  const { startTransaction } = useCreateCaseWithAttachmentsTransaction();
  const trackAttachEvents = useAttachEventsEBT();

  const submitCase = useCallback(
    async (data: CasePostRequest, isValid: boolean) => {
      if (isValid) {
        startTransaction({ appId, attachments });

        const theCase = await postCase({
          request: data,
        });

        if (theCase && Array.isArray(attachments) && attachments.length > 0) {
          await createAttachments({
            caseId: theCase.id,
            caseOwner: theCase.owner,
            attachments,
          });

          trackAttachEvents(window.location.pathname, attachments);
        }

        if (afterCaseCreated && theCase) {
          await afterCaseCreated(theCase, createAttachments);
        }

        if (theCase?.id && data.connector.id !== 'none') {
          try {
            await pushCaseToExternalService({
              caseId: theCase.id,
              connector: data.connector,
            });
          } catch (error) {
            // Catch the error but do not interrupt the flow.
            // The case has been created successfully at this point.
            // The only thing that failed was pushing to the external service.
            // Changes to the connector fields can be made later on by the user.
            // They will be notified about the connector failure.
          }
        }

        if (onSuccess && theCase) {
          onSuccess(theCase);
        }
      }
    },
    [
      startTransaction,
      appId,
      attachments,
      postCase,
      afterCaseCreated,
      onSuccess,
      createAttachments,
      trackAttachEvents,
      pushCaseToExternalService,
    ]
  );

  return {
    submitCase,
    isSubmitting: isPostingCase || isCreatingAttachments || isPushingToExternalService,
  };
};
