/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, lazy, type ComponentType } from 'react';
import { EuiAvatar } from '@elastic/eui';
import type {
  CommonAttachmentTabViewProps,
  UnifiedReferenceAttachmentType,
} from '@kbn/cases-plugin/public';
import { AttachmentActionType } from '@kbn/cases-plugin/public';
import {
  SECURITY_EVENT_ATTACHMENT_TYPE,
  isIndexMetadata,
  toStringArray,
} from '@kbn/cases-plugin/common';
import type { UnifiedReferenceAttachmentViewProps } from '@kbn/cases-plugin/public/client/attachment_framework/types';
import { UserActionTitle } from '@kbn/cases-components';
import { getNonEmptyField } from './utils';
import {
  DELETE_EVENTS_SUCCESS_TITLE,
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

const EventTabContentWrapper: ComponentType<CommonAttachmentTabViewProps> = (props) => (
  <Suspense fallback={null}>
    <EventTabContent {...props} />
  </Suspense>
);

const getAttachmentViewObject = (props: UnifiedReferenceAttachmentViewProps) => {
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
    timelineAvatar: <EuiAvatar name="event" color="subdued" iconType="bell" aria-label="event" />,
    deleteSuccessTitle: DELETE_EVENTS_SUCCESS_TITLE(Math.max(eventIds.length, 1)),
    getActions: (actionProps: UnifiedReferenceAttachmentViewProps) => {
      const actions = [];
      if (isSingleEvent && eventIds[0] && index) {
        actions.push({
          type: AttachmentActionType.CUSTOM as const,
          isPrimary: true,
          render: () => (
            <Suspense fallback={null}>
              <ShowEventButton id={actionProps.savedObjectId} eventId={eventIds[0]} index={index} />
            </Suspense>
          ),
        });
      }
      return actions;
    },
  };
};

const getAttachmentRemovalObject = (props: UnifiedReferenceAttachmentViewProps) => {
  const eventIds = toStringArray(props.attachmentId);
  if (eventIds.length <= 1) {
    return { event: REMOVED_EVENT_LABEL_TITLE };
  }
  return { event: REMOVED_EVENTS_LABEL_TITLE(eventIds.length) };
};

/**
 * Returns the event attachment type for registration with the unified registry.
 */
export const getEventType = (): UnifiedReferenceAttachmentType => ({
  id: SECURITY_EVENT_ATTACHMENT_TYPE,
  displayName: EVENT_DISPLAY_NAME,
  icon: 'bell',
  getAttachmentViewObject: (props) => getAttachmentViewObject(props),
  getAttachmentRemovalObject: (props) => getAttachmentRemovalObject(props),
  getAttachmentTabViewObject: () => ({
    children: EventTabContentWrapper,
  }),
});
