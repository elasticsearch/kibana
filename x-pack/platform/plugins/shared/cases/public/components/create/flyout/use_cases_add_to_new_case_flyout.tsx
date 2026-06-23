/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import { useCallback, useMemo } from 'react';
import type { CaseAttachmentsWithoutOwner } from '../../../types';
import { useCasesToast } from '../../../common/use_cases_toast';
import type { CaseUI } from '../../../containers/types';
import { CasesContextStoreActionsList } from '../../cases_context/state/cases_context_reducer';
import { useCasesContext } from '../../cases_context/use_cases_context';
import type { CreateCaseFlyoutProps } from './create_case_flyout';

type AddToNewCaseFlyoutProps = Omit<CreateCaseFlyoutProps, 'attachments'> & {
  toastTitle?: string;
  toastContent?: string;
};

export const useCasesAddToNewCaseFlyout = ({
  initialValue,
  toastTitle,
  toastContent,

  afterCaseCreated,
  onSuccess,
  onClose,
}: AddToNewCaseFlyoutProps = {}) => {
  const { dispatch } = useCasesContext();
  const casesToasts = useCasesToast();

  const closeFlyout = useCallback(() => {
    dispatch({
      type: CasesContextStoreActionsList.CLOSE_CREATE_CASE_FLYOUT,
    });
  }, [dispatch]);

  const openFlyout = useCallback(
    ({
      attachments,
      headerContent,
    }: {
      attachments?: CaseAttachmentsWithoutOwner;
      headerContent?: React.ReactNode;
    } = {}) => {
      dispatch({
        type: CasesContextStoreActionsList.OPEN_CREATE_CASE_FLYOUT,
        payload: {
          initialValue,
          attachments,
          headerContent,
          onClose: () => {
            closeFlyout();
            if (onClose) {
              return onClose();
            }
          },
          onSuccess: async (theCase: CaseUI) => {
            if (theCase) {
              casesToasts.showSuccessAttach({
                theCase,
                attachments: attachments ?? [],
                title: toastTitle,
                content: toastContent,
              });
            }
            if (onSuccess) {
              return onSuccess(theCase);
            }
          },
          afterCaseCreated: async (...args) => {
            closeFlyout();
            if (afterCaseCreated) {
              return afterCaseCreated(...args);
            }
          },
        },
      });
    },
    [
      initialValue,
      casesToasts,
      closeFlyout,
      dispatch,
      toastTitle,
      toastContent,
      afterCaseCreated,
      onSuccess,
      onClose,
    ]
  );
  return useMemo(() => {
    return {
      open: openFlyout,
      close: closeFlyout,
    };
  }, [openFlyout, closeFlyout]);
};

export type UseCasesAddToNewCaseFlyout = typeof useCasesAddToNewCaseFlyout;
