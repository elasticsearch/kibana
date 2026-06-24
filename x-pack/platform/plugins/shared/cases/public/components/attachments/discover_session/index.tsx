/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  DiscoverSessionAttachmentPayloadSchema,
  type SavedObjectReferenceMetadata,
} from '../../../../common/types/domain_zod/attachment/saved_object/v2';
import {
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  DISCOVER_SESSION_SO_TYPE,
} from '../../../../common/constants/attachments';
import {
  defineAttachment,
  type UnifiedReferenceAttachmentViewProps,
} from '../../../client/attachment_framework/types';
import { SavedObjectAddedEvent } from '../common/saved_object/saved_object_added_event';
import { createSavedObjectAttachmentsTab } from '../common/saved_object/saved_object_attachments_tab';
import * as i18n from './translations';

const DiscoverSessionEvent: React.FC<
  UnifiedReferenceAttachmentViewProps<SavedObjectReferenceMetadata, string>
> = ({ attachmentId, metadata }) => (
  <SavedObjectAddedEvent
    soType={DISCOVER_SESSION_SO_TYPE}
    attachmentId={attachmentId}
    title={metadata?.title}
    label={i18n.ADDED_DISCOVER_SESSION}
    data-test-subj={`cases-discover-session-event-link-${attachmentId}`}
  />
);

DiscoverSessionEvent.displayName = 'DiscoverSessionEvent';

const DiscoverSessionAttachmentsTab = createSavedObjectAttachmentsTab({
  attachmentTypeId: DISCOVER_SESSION_ATTACHMENT_TYPE,
  soType: DISCOVER_SESSION_SO_TYPE,
});

export const getDiscoverSessionAttachmentType = () =>
  defineAttachment({
    id: DISCOVER_SESSION_ATTACHMENT_TYPE,
    icon: 'discoverApp',
    displayName: i18n.DISCOVER_SESSIONS,
    schema: DiscoverSessionAttachmentPayloadSchema,
    getAttachmentViewObject: (props) => ({
      event: <DiscoverSessionEvent {...props} />,
      timelineAvatar: 'discoverApp',
      hideDefaultActions: false,
    }),
    getAttachmentRemovalObject: () => ({ event: i18n.REMOVED_DISCOVER_SESSION }),
    getAttachmentTabViewObject: () => ({ children: DiscoverSessionAttachmentsTab }),
  });
