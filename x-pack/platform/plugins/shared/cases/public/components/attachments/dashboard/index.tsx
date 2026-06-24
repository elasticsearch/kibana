/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { DASHBOARD_ATTACHMENT_TYPE, DASHBOARD_SO_TYPE } from '../../../../common/constants';
import {
  DashboardAttachmentPayloadSchema,
  type DashboardAttachmentData,
  type DashboardAttachmentMetadata,
} from '../../../../common/types/domain_zod/attachment/dashboard/v2';
import {
  defineAttachment,
  type UnifiedReferenceAttachmentViewProps,
} from '../../../client/attachment_framework/types';
import * as i18n from './translations';
import { SavedObjectAddedEvent } from '../common/saved_object/saved_object_added_event';
import { createSavedObjectAttachmentsTab } from '../common/saved_object/saved_object_attachments_tab';

type DashboardViewProps = UnifiedReferenceAttachmentViewProps<
  DashboardAttachmentMetadata,
  string,
  DashboardAttachmentData
>;

const DashboardEmbedAttachmentLazy = React.lazy(async () => {
  const { DashboardEmbedAttachment } = await import('./dashboard_embed_attachment');
  return { default: DashboardEmbedAttachment };
});

const DashboardAttachmentsTab = createSavedObjectAttachmentsTab({
  attachmentTypeId: DASHBOARD_ATTACHMENT_TYPE,
  soType: DASHBOARD_SO_TYPE,
});

const getDashboardAttachmentViewObject = ({ attachmentId, metadata, data }: DashboardViewProps) => {
  const event = (
    <SavedObjectAddedEvent
      soType={DASHBOARD_SO_TYPE}
      attachmentId={attachmentId}
      title={metadata?.title}
      label={i18n.ADDED_DASHBOARD}
      data-test-subj="cases-dashboard-event-link"
    />
  );

  return {
    event,
    timelineAvatar: 'dashboardApp' as const,
    hideDefaultActions: false,
    ...(data ? { children: DashboardEmbedAttachmentLazy } : {}),
  };
};

export const getDashboardAttachmentType = () =>
  defineAttachment({
    id: DASHBOARD_ATTACHMENT_TYPE,
    icon: 'dashboardApp',
    displayName: i18n.DASHBOARDS,
    getAttachmentViewObject: getDashboardAttachmentViewObject,
    getAttachmentRemovalObject: () => ({ event: i18n.REMOVED_DASHBOARD }),
    getAttachmentTabViewObject: () => ({ children: DashboardAttachmentsTab }),
    schema: DashboardAttachmentPayloadSchema,
  });
