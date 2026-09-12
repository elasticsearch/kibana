/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type ComponentType, lazy, Suspense } from 'react';
import { EuiLoadingSpinner } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type {
  CommonAttachmentListViewProps,
  UnifiedReferenceAttachmentViewProps,
} from '@kbn/cases-plugin/public';
import { defineAttachment } from '@kbn/cases-plugin/public';
import {
  type AlertAttachmentMetadata,
  AttachmentActionType,
  CASE_VIEW_PAGE_TABS,
  getNonEmptyField,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  toStringArray,
} from '@kbn/cases-plugin/common';
import { isNonLocalIndexName } from '@kbn/es-query';
import { SecurityAlertAttachmentPayloadSchema } from '../../../../common/cases/attachments/alert';
import * as i18n from './translations';

const AlertEvent = lazy(async () => {
  const { AlertEvent: Component } = await import('./components/alert_event');
  return { default: Component };
});

const ShowAlertButton = lazy(async () => {
  const { ShowAlertButton: Component } = await import('./components/show_alert_button');
  return { default: Component };
});

const ShowTableButton = lazy(async () => {
  const { ShowTableButton: Component } = await import('@kbn/cases-plugin/public');
  return { default: Component };
});

const AlertTabContent = lazy(async () => {
  const { AlertTabContent: Component } = await import('./components/alert_tab_content');
  return { default: Component };
});

const AlertTabContentWrapper: ComponentType<CommonAttachmentListViewProps> = (props) => (
  <Suspense fallback={<EuiLoadingSpinner size="l" />}>
    <AlertTabContent {...props} />
  </Suspense>
);

type SecurityAlertViewProps = UnifiedReferenceAttachmentViewProps<AlertAttachmentMetadata>;

const getCreationActivity = (props: SecurityAlertViewProps) => {
  const { savedObjectId, attachmentId, metadata } = props;
  const alertIds = toStringArray(attachmentId);
  const totalAlerts = alertIds.length;
  const isSingleAlert = totalAlerts === 1;
  const index = getNonEmptyField(metadata?.index);
  const alertId = getNonEmptyField(alertIds[0]);
  const isRemoteAlert = isNonLocalIndexName(index ?? '');
  return {
    event: (
      <Suspense fallback={<EuiLoadingSpinner size="m" />}>
        <AlertEvent
          key={savedObjectId}
          alertId={alertId ?? ''}
          totalAlerts={totalAlerts}
          savedObjectId={savedObjectId}
          rule={metadata?.rule}
          isRemoteAlert={isRemoteAlert}
        />
      </Suspense>
    ),
    deleteSuccessToast: i18n.DELETE_ALERTS_SUCCESS_TOAST(Math.max(totalAlerts, 1)),
    getActions: () => [
      {
        type: AttachmentActionType.CUSTOM as const,
        isPrimary: true,
        render: () => (
          <Suspense fallback={<EuiLoadingSpinner size="m" />}>
            {isSingleAlert && alertId && index ? (
              <ShowAlertButton
                id={savedObjectId}
                alertId={alertId}
                index={index}
                ruleName={metadata?.rule?.name}
              />
            ) : (
              <ShowTableButton tabId={CASE_VIEW_PAGE_TABS.ALERTS} />
            )}
          </Suspense>
        ),
      },
    ],
  };
};

const getRemovalActivity = (props: SecurityAlertViewProps) => {
  const alertIds = toStringArray(props.attachmentId);
  if (alertIds.length <= 1) {
    return { event: i18n.REMOVED_ALERT_LABEL_TITLE };
  }
  return { event: i18n.REMOVED_ALERTS_LABEL_TITLE(alertIds.length) };
};

/**
 * Returns the alert attachment type for registration with the unified registry.
 */
export const getSecurityAlertType = () =>
  defineAttachment({
    id: SECURITY_ALERT_ATTACHMENT_TYPE,
    getLabel: () => i18n.ALERT_DISPLAY_NAME,
    getIcon: () => 'bell',
    getCreationActivity,
    getRemovalActivity,
    getAttachmentList: () => ({
      children: AlertTabContentWrapper,
    }),
    workflow: {
      getActivityLabel: ({ workflowName, count }) => (
        <FormattedMessage
          id="xpack.securitySolution.cases.alertAttachment.workflowActivityLabel"
          defaultMessage="ran {name} on {count, plural, =0 {an alert} one {# alert} other {# alerts}}"
          values={{ name: workflowName, count: count ?? 0 }}
        />
      ),
    },
    getDocumentAction: ({ id, documentId, index }) => {
      const documentIndex = getNonEmptyField(index);
      return documentIndex
        ? {
            type: AttachmentActionType.CUSTOM as const,
            isPrimary: true,
            render: () => (
              <Suspense fallback={<EuiLoadingSpinner size="m" />}>
                <ShowAlertButton id={id} alertId={documentId} index={documentIndex} />
              </Suspense>
            ),
          }
        : null;
    },
    schema: SecurityAlertAttachmentPayloadSchema,
  });
