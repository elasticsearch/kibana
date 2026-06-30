/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ErrorToastOptions, ToastInputFields } from '@kbn/core/public';
import { useMemo } from 'react';
import { isValidOwner } from '../../common/utils/owner';
import type { CaseUI } from '../../common';
import { AttachmentType } from '../../common/types/domain';
import { useKibana, useToasts } from './lib/kibana';
import { generateCaseViewPath } from './navigation';
import type { CaseAttachmentsWithoutOwner, ServerError } from '../types';
import {
  CASE_ALERT_SUCCESS_SYNC_TEXT,
  CASE_ALERT_SUCCESS_OBSERVABLES_TEXT,
  CASE_ALERT_SUCCESS_SYNC_AND_EXTRACT_TEXT,
  CASE_ALERT_SUCCESS_TOAST,
  CASE_SUCCESS_TOAST,
  VIEW_CASE,
} from './translations';
import { OWNER_INFO } from '../../common/constants';
import { useApplication } from './lib/kibana/use_application';

function getAlertsCount(attachments: CaseAttachmentsWithoutOwner): number {
  let alertsCount = 0;
  for (const attachment of attachments) {
    if (attachment.type === AttachmentType.alert && `alertId` in attachment) {
      // alertId might be an array
      if (Array.isArray(attachment.alertId) && attachment.alertId.length > 1) {
        alertsCount += attachment.alertId.length;
      } else {
        // or might be a single string
        alertsCount++;
      }
    }
  }
  return alertsCount;
}

function getToastTitle({
  theCase,
  title,
  attachments,
}: {
  theCase: CaseUI;
  title?: string;
  attachments?: CaseAttachmentsWithoutOwner;
}): string {
  if (title !== undefined) {
    return title;
  }
  if (attachments !== undefined) {
    const alertsCount = getAlertsCount(attachments);
    if (alertsCount > 0) {
      return CASE_ALERT_SUCCESS_TOAST(theCase.title, alertsCount);
    }
  }
  return CASE_SUCCESS_TOAST(theCase.title);
}

function getToastContent({
  theCase,
  content,
  attachments,
}: {
  theCase: CaseUI;
  content?: string;
  attachments?: CaseAttachmentsWithoutOwner;
}): string | undefined {
  if (content !== undefined) {
    return content;
  }

  let toastContent;
  if (attachments !== undefined) {
    for (const attachment of attachments) {
      if (attachment.type === AttachmentType.alert) {
        if (theCase.settings.syncAlerts && theCase.settings.extractObservables) {
          toastContent = CASE_ALERT_SUCCESS_SYNC_AND_EXTRACT_TEXT;
        } else if (theCase.settings.syncAlerts) {
          toastContent = CASE_ALERT_SUCCESS_SYNC_TEXT;
        } else if (theCase.settings.extractObservables) {
          toastContent = CASE_ALERT_SUCCESS_OBSERVABLES_TEXT;
        }
      }
    }
  }

  return toastContent;
}

const isServerError = (error: Error | ServerError): error is ServerError =>
  Object.hasOwn(error, 'body');

const getError = (error: Error | ServerError): Error => {
  if (isServerError(error)) {
    return new Error(error.body?.message);
  }

  return error;
};

const getErrorMessage = (error: Error | ServerError): string => {
  if (isServerError(error)) {
    return error.body?.message ?? '';
  }

  return error.message;
};

export const useCasesToast = () => {
  const { appId } = useApplication();
  const { application } = useKibana().services;
  const { getUrlForApp, navigateToUrl } = application;

  const toasts = useToasts();

  return useMemo(
    () => ({
      showSuccessAttach: ({
        theCase,
        attachments,
        title,
        content,
      }: {
        theCase: CaseUI;
        attachments?: CaseAttachmentsWithoutOwner;
        title?: string;
        content?: string;
      }) => {
        const appIdToNavigateTo = isValidOwner(theCase.owner)
          ? OWNER_INFO[theCase.owner].appId
          : appId;

        const url =
          appIdToNavigateTo != null
            ? getUrlForApp(appIdToNavigateTo, {
                deepLinkId: 'cases',
                path: generateCaseViewPath({ detailName: theCase.id }),
              })
            : null;

        const onViewCaseClick = () => {
          if (url) {
            navigateToUrl(url);
          }
        };

        const renderTitle = getToastTitle({ theCase, title, attachments });
        const renderContent = getToastContent({ theCase, content, attachments });

        return toasts.addSuccess({
          'data-test-subj': 'cases-toast-success-attach',
          title: renderTitle,
          text: renderContent,
          ...(url != null
            ? {
                actionProps: {
                  primary: {
                    onClick: onViewCaseClick,
                    'data-test-subj': 'toaster-content-case-view-link',
                    children: VIEW_CASE,
                  },
                },
              }
            : {}),
        });
      },
      showErrorToast: (error: Error | ServerError, opts?: ErrorToastOptions) => {
        if (error.name !== 'AbortError') {
          toasts.addError(getError(error), { title: getErrorMessage(error), ...opts });
        }
      },
      showSuccessToast: (title: string, text?: ToastInputFields['text']) => {
        toasts.addSuccess({ title, text, className: 'eui-textBreakWord' });
      },
      showDangerToast: (title: string, text?: string) => {
        toasts.addDanger({ title, text, className: 'eui-textBreakWord' });
      },
      showInfoToast: (title: string, text?: string) => {
        toasts.addInfo({
          title,
          text,
          className: 'eui-textBreakWord',
        });
      },
    }),
    [appId, getUrlForApp, navigateToUrl, toasts]
  );
};
