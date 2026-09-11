/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { useAttachEventsEBT } from '../../../analytics/use_attach_events_ebt';
import { useApplication } from '../../../common/lib/kibana/use_application';
import { CaseStatuses } from '../../../../common/types/domain';
import type { AllCasesSelectorModalProps } from '.';
import { useCasesToast } from '../../../common/use_cases_toast';
import type { CaseUI } from '../../../containers/types';
import { CasesContextStoreActionsList } from '../../cases_context/state/cases_context_reducer';
import { useCasesContext } from '../../cases_context/use_cases_context';
import { useCasesAddToNewCaseFlyout } from '../../create/flyout/use_cases_add_to_new_case_flyout';
import type { CreateCaseFlyoutProps } from '../../create/flyout/create_case_flyout';
import type { CaseAttachmentsWithoutOwner } from '../../../types';
import { useCreateAttachments } from '../../../containers/use_create_attachments';
import { useAddAttachmentToExistingCaseTransaction } from '../../../common/apm/use_cases_transactions';
import { NO_ATTACHMENTS_ADDED } from '../translations';

export type AddToExistingCaseModalProps = Omit<AllCasesSelectorModalProps, 'onRowClick'> & {
  createCaseFlyout?: Pick<CreateCaseFlyoutProps, 'headerContent' | 'initialValue'>;
  successToaster?: {
    title?: string;
    content?: string;
  };
  noAttachmentsToaster?: {
    title?: string;
    content?: string;
  };
  onSuccess?: (theCase: CaseUI, isNewCase: boolean) => void;
};

export type GetAttachments = ({ theCase }: { theCase?: CaseUI }) => CaseAttachmentsWithoutOwner;

export const useCasesAddToExistingCaseModal = ({
  createCaseFlyout,
  successToaster,
  noAttachmentsToaster,
  onSuccess,
  onClose,
  onCreateCaseClicked,
}: AddToExistingCaseModalProps = {}) => {
  const handleSuccess = useCallback(
    (theCase?: CaseUI) => {
      if (onSuccess && theCase) {
        return onSuccess(theCase, true);
      }
    },
    [onSuccess]
  );
  const { open: openCreateNewCaseFlyout } = useCasesAddToNewCaseFlyout({
    initialValue: createCaseFlyout?.initialValue,
    onClose,
    onSuccess: handleSuccess,
    toastTitle: successToaster?.title,
    toastContent: successToaster?.content,
  });

  const { dispatch } = useCasesContext();
  const { appId } = useApplication();
  const casesToasts = useCasesToast();
  const { mutateAsync: createAttachments } = useCreateAttachments();
  const { startTransaction } = useAddAttachmentToExistingCaseTransaction();

  const closeModal = useCallback(() => {
    dispatch({
      type: CasesContextStoreActionsList.CLOSE_ADD_TO_CASE_MODAL,
    });
    // in case the flyout was also open when selecting
    // create a new case
    dispatch({
      type: CasesContextStoreActionsList.CLOSE_CREATE_CASE_FLYOUT,
    });
  }, [dispatch]);

  const trackAttachEvents = useAttachEventsEBT();

  const handleOnRowClick = useCallback(
    async (
      theCase: CaseUI | undefined,
      getAttachments: ({ theCase }: { theCase?: CaseUI }) => CaseAttachmentsWithoutOwner
    ) => {
      // when the case is undefined in the modal
      // the user clicked "create new case". The case (and its owner) doesn't exist yet,
      // so resolve owner-dependent attachments lazily once the flyout creates it instead
      // of eagerly resolving here, which would lock in an empty array for callers whose
      // getAttachments depends on theCase.owner.
      if (theCase === undefined) {
        closeModal();
        openCreateNewCaseFlyout({
          getAttachments: (owner: string) => getAttachments({ theCase: { owner } as CaseUI }) ?? [],
          headerContent: createCaseFlyout?.headerContent,
        });
        return;
      }

      const attachments = getAttachments?.({ theCase }) ?? [];

      try {
        // add attachments to the case
        if (attachments === undefined || attachments.length === 0) {
          const title = noAttachmentsToaster?.title ?? NO_ATTACHMENTS_ADDED;
          const content = noAttachmentsToaster?.content;
          casesToasts.showInfoToast(title, content);

          return;
        }

        startTransaction({ appId, attachments });

        await createAttachments({
          caseId: theCase.id,
          caseOwner: theCase.owner,
          attachments,
        });

        trackAttachEvents(window.location.pathname, attachments);

        onSuccess?.(theCase, false);

        casesToasts.showSuccessAttach({
          theCase,
          attachments,
          title: successToaster?.title,
          content: successToaster?.content,
        });
      } catch (error) {
        // error toast is handled
        // inside the createAttachments method
      }
    },
    [
      closeModal,
      createCaseFlyout?.headerContent,
      openCreateNewCaseFlyout,
      startTransaction,
      appId,
      createAttachments,
      trackAttachEvents,
      onSuccess,
      casesToasts,
      successToaster?.title,
      successToaster?.content,
      noAttachmentsToaster?.title,
      noAttachmentsToaster?.content,
    ]
  );

  const openModal = useCallback(
    ({ getAttachments }: { getAttachments: GetAttachments }) => {
      dispatch({
        type: CasesContextStoreActionsList.OPEN_ADD_TO_CASE_MODAL,
        payload: {
          hiddenStatuses: [CaseStatuses.closed],
          onCreateCaseClicked,
          getAttachments,
          onRowClick: (theCase?: CaseUI) => {
            handleOnRowClick(theCase, getAttachments);
          },
          onClose: (theCase?: CaseUI, isCreateCase?: boolean) => {
            closeModal();

            if (onClose) {
              return onClose(theCase, isCreateCase);
            }
          },
        },
      });
    },
    [closeModal, dispatch, handleOnRowClick, onClose, onCreateCaseClicked]
  );

  return useMemo(() => {
    return {
      open: openModal,
      close: closeModal,
    };
  }, [openModal, closeModal]);
};
export type UseCasesAddToExistingCaseModal = typeof useCasesAddToExistingCaseModal;
