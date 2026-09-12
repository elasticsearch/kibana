/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, lazy, type ComponentType } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type {
  CommonAttachmentListViewProps,
  UnifiedReferenceAttachmentViewProps,
} from '@kbn/cases-plugin/public';
import { AttachmentActionType, defineAttachment } from '@kbn/cases-plugin/public';
import {
  SECURITY_EVENT_ATTACHMENT_TYPE,
  isIndexMetadata,
  toStringArray,
} from '@kbn/cases-plugin/common';
import { UserActionTitle } from '@kbn/cases-components';
import { SecurityEventAttachmentPayloadSchema } from '../../../../common/cases/attachments/event';
import { getNonEmptyField } from './utils';
import {
  DELETE_EVENTS_SUCCESS_TOAST,
  EVENT_COMMENT_LABEL_TITLE,
  EVENT_DISPLAY_NAME,
  MULTIPLE_EVENTS_COMMENT_LABEL_TITLE,
  REMOVED_EVENT_LABEL_TITLE,
  REMOVED_EVENTS_LABEL_TITLE,
} from './translations';

const ShowEventButton = lazy(async () => {
  const { ShowEventButton: Component } = await import('./components/show_event_button');
  return { default: Component };
});

const EventTabContent = lazy(async () => {
  const { EventTabContent: Component } = await import('./components/event_tab_content');
  return { default: Component };
});

const EventTabContentWrapper: ComponentType<CommonAttachmentListViewProps> = (props) => (
  <Suspense fallback={null}>
    <EventTabContent {...props} />
  </Suspense>
);

const getCreationActivity = (props: UnifiedReferenceAttachmentViewProps) => {
  const { savedObjectId, attachmentId, metadata } = props;
  const eventIds = toStringArray(attachmentId);
  const isSingleEvent = eventIds.length === 1;
  const validMetadata = metadata != null && isIndexMetadata(metadata) ? metadata : undefined;
  const index = getNonEmptyField(validMetadata?.index);

  return {
    eventColor: 'subdued' as const,
    event: (
      <UserActionTitle
        label={
          isSingleEvent
            ? EVENT_COMMENT_LABEL_TITLE
            : MULTIPLE_EVENTS_COMMENT_LABEL_TITLE(eventIds.length)
        }
        dataTestSubj={`event-user-action-${savedObjectId}`}
      />
    ),
    deleteSuccessToast: DELETE_EVENTS_SUCCESS_TOAST(Math.max(eventIds.length, 1)),
    getActions: () =>
      isSingleEvent && eventIds[0] && index
        ? [
            {
              type: AttachmentActionType.CUSTOM as const,
              isPrimary: true,
              render: () => (
                <Suspense fallback={null}>
                  <ShowEventButton id={savedObjectId} eventId={eventIds[0]} index={index} />
                </Suspense>
              ),
            },
          ]
        : [],
  };
};

const getRemovalActivity = (props: UnifiedReferenceAttachmentViewProps) => {
  const eventIds = toStringArray(props.attachmentId);
  if (eventIds.length <= 1) {
    return { event: REMOVED_EVENT_LABEL_TITLE };
  }
  return { event: REMOVED_EVENTS_LABEL_TITLE(eventIds.length) };
};

/**
 * Returns the event attachment type for registration with the unified registry.
 */
export const getEventType = () =>
  defineAttachment({
    id: SECURITY_EVENT_ATTACHMENT_TYPE,
    getLabel: () => EVENT_DISPLAY_NAME,
    getIcon: () => 'bell',
    schema: SecurityEventAttachmentPayloadSchema,
    getCreationActivity,
    getRemovalActivity,
    getAttachmentList: () => ({
      children: EventTabContentWrapper,
    }),
    workflow: {
      getActivityLabel: ({ workflowName, count }) => (
        <FormattedMessage
          id="xpack.securitySolution.cases.eventAttachment.workflowActivityLabel"
          defaultMessage="ran {name} on {count, plural, =0 {an event} one {# event} other {# events}}"
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
              <Suspense fallback={null}>
                <ShowEventButton id={id} eventId={documentId} index={documentIndex} />
              </Suspense>
            ),
          }
        : null;
    },
  });
